import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover, type DiscoverDeps } from "../../main/discovery/index.ts";
import { canonicalUrl } from "../../main/discovery/normalize.ts";
import { loadFixtures, readCache, writeCache } from "../../main/discovery/cache.ts";
import type { DiscoverEvent, DiscoverRequest } from "../../main/discovery/types.ts";
import type { SearchResult } from "../../main/discovery/parallel.ts";
import searchRec from "./recordings/search-career.json" with { type: "json" };

const req: DiscoverRequest = { area: "career", goal: "become part of the SF AI founder scene", city: "San Francisco", windowDays: 7 };
const now = () => new Date("2026-10-19T12:00:00-07:00");
const eventResults = searchRec.response.results as SearchResult[];
const placeResults: SearchResult[] = [
  { url: "https://example.com/spaces/founders-loft", title: "Founders Loft coworking", publish_date: null, excerpts: ["Coworking for AI founders in SoMa, San Francisco"] },
  { url: "https://example.com/spaces/build-cafe", title: "Build Cafe", publish_date: null, excerpts: ["Laptop-friendly cafe in San Francisco"] },
];

type SearchReq = { objective: string; queries: string[]; includeDomains?: string[] };

// Answers by kind: event domains get the D0 recording, the open-web place search gets two places.
function stubSearch(behavior: "ok" | "fail" | "people-fail" = "ok") {
  const calls: SearchReq[] = [];
  const fn = async (r: SearchReq) => {
    calls.push(r);
    if (behavior === "fail") throw new Error("Parallel search 503: unavailable");
    if (r.includeDomains?.includes("linkedin.com")) {
      if (behavior === "people-fail") throw new Error("Parallel search 500");
      return [];
    }
    return r.includeDomains ? eventResults : placeResults;
  };
  return Object.assign(fn, { calls });
}

function deps(over: Partial<DiscoverDeps> = {}): DiscoverDeps {
  return { env: { PARALLEL_API_KEY: "test-key" }, now, cacheDir: mkdtempSync(join(tmpdir(), "nomi-discover-")), model: null, ...over };
}

test("live: returns up to limit valid, unique opportunities and caches them", async () => {
  const d = deps({ search: stubSearch() });
  const res = await discover(req, undefined, d);
  assert.equal(res.mode, "live");
  assert.ok(res.opportunities.length >= 3 && res.opportunities.length <= 5, `${res.opportunities.length} results`);
  const urls = res.opportunities.map((o) => o.url);
  assert.equal(new Set(urls).size, urls.length);
  for (const o of res.opportunities) {
    assert.equal(o.url, canonicalUrl(o.url));
    assert.ok(o.title && o.joinMode && o.whyMatch && o.citations.length >= 1);
  }
  assert.match(res.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(typeof res.tookMs, "number");
  assert.deepEqual(readCache(req, d.cacheDir)?.opportunities, res.opportunities);
});

test("live: mixes kinds instead of filling the list with the first search's results", async () => {
  const res = await discover(req, undefined, deps({ search: stubSearch() }));
  const kinds = new Set(res.opportunities.map((o) => o.kind));
  assert.ok(kinds.has("place"), `kinds: ${[...kinds]}`);
});

test("live: emits search, extract and rank progress in order, each started then done", async () => {
  const events: DiscoverEvent[] = [];
  const res = await discover(req, (e) => events.push(e), deps({ search: stubSearch() }));
  const steps = events.map((e) => (e.type === "progress" ? `${e.step}:${e.done}` : e.type));
  assert.deepEqual(steps, ["search:false", "search:true", "extract:false", "extract:true", "rank:false", "rank:true"]);
  assert.ok(events.every((e) => e.requestId === res.requestId));
  const first = events[0];
  assert.ok(first.type === "progress" && /Luma/.test(first.label) && /Meetup/.test(first.label), "label names the sites");
});

test("no key: resolves in mock mode with fixtures and never calls Search", async () => {
  const search = stubSearch();
  const res = await discover(req, undefined, deps({ env: {}, search }));
  assert.equal(res.mode, "mock");
  assert.deepEqual(res.opportunities, loadFixtures("career").slice(0, 5));
  assert.equal(search.calls.length, 0);
  assert.ok(res.warnings.some((w) => /PARALLEL_API_KEY/.test(w)));
});

test("search failure: falls back to the cached result with a warning", async () => {
  const d = deps({ search: stubSearch("fail") });
  const cached = loadFixtures("career").slice(0, 2);
  writeCache(req, cached, d.cacheDir);
  const res = await discover(req, undefined, d);
  assert.equal(res.mode, "cache");
  assert.deepEqual(res.opportunities, cached);
  assert.ok(res.warnings.some((w) => /503/.test(w)));
});

test("search failure with nothing cached: falls back to fixtures with a warning", async () => {
  const res = await discover(req, undefined, deps({ search: stubSearch("fail") }));
  assert.equal(res.mode, "mock");
  assert.deepEqual(res.opportunities, loadFixtures("career").slice(0, 5));
  assert.ok(res.warnings.length > 0);
});

test("one failed search still returns live results from the others, with a warning", async () => {
  const res = await discover(req, undefined, deps({ search: stubSearch("people-fail") }));
  assert.equal(res.mode, "live");
  assert.ok(res.opportunities.length >= 3);
  assert.ok(res.warnings.some((w) => /person/.test(w)));
});

test("cache mode replays without searching; a miss falls back to fixtures", async () => {
  const d = deps({ env: { NOMI_DISCOVERY_MODE: "cache" }, search: stubSearch() });
  const cached = loadFixtures("career").slice(1);
  writeCache(req, cached, d.cacheDir);
  const hit = await discover(req, undefined, d);
  assert.equal(hit.mode, "cache");
  assert.deepEqual(hit.opportunities, cached);
  const miss = await discover({ ...req, area: "health" }, undefined, { ...d, cacheDir: join(d.cacheDir!, "empty") });
  assert.equal(miss.mode, "mock");
  assert.deepEqual(miss.opportunities, loadFixtures("health"));
  assert.equal((d.search as ReturnType<typeof stubSearch>).calls.length, 0);
});

test("limit caps the result count", async () => {
  const res = await discover({ ...req, limit: 2 }, undefined, deps({ search: stubSearch() }));
  assert.equal(res.opportunities.length, 2);
});

test("invalid input rejects; it's the only case that throws", async () => {
  const d = deps({ search: stubSearch() });
  await assert.rejects(discover({ ...req, goal: " " }, undefined, d), /goal/);
  await assert.rejects(discover({ ...req, area: "finance" as never }, undefined, d), /area/);
  await assert.rejects(discover({ ...req, windowDays: 0 }, undefined, d), /windowDays/);
  await assert.rejects(discover({ ...req, city: "" }, undefined, d), /city/);
});

test("career lists events and groups before places and people", async () => {
  const res = await discover(req, undefined, deps({ search: stubSearch() }));
  const kinds = res.opportunities.map((o) => o.kind);
  assert.ok(kinds[0] === "event" || kinds[0] === "group", `order: ${kinds}`);
  const firstPlace = kinds.indexOf("place");
  const firstGroup = kinds.indexOf("group");
  assert.ok(firstPlace > 0, `order: ${kinds}`);
  assert.ok(firstGroup >= 0 && firstGroup < firstPlace, `groups come before places: ${kinds}`);
});
