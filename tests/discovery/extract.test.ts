import { test } from "node:test";
import assert from "node:assert/strict";
import { planQueries } from "../../main/discovery/queries.ts";
import { extract, rank, type Hit, type ModelFn } from "../../main/discovery/extract.ts";
import type { DiscoverRequest, Opportunity } from "../../main/discovery/types.ts";
import type { SearchResult } from "../../main/discovery/parallel.ts";
import searchRec from "./recordings/search-career.json" with { type: "json" };

const now = new Date("2026-10-19T12:00:00-07:00");
const req: DiscoverRequest = {
  area: "career",
  goal: "become part of the SF AI founder scene",
  context: "met Priya who's building voice agents",
  city: "San Francisco",
  windowDays: 7,
};
const results = searchRec.response.results as SearchResult[];
const hits = results.map((r) => ({ ...r, kind: "event" as const }));
const words = (s: string) => s.trim().split(/\s+/).length;

// Returns a canned reply and records the prompts, standing in for lib/llm.ts chat().
function stubModel(reply: unknown): ModelFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (messages: { role: string; content: string }[]) => {
    calls.push(messages.map((m) => m.content).join("\n"));
    return typeof reply === "string" ? reply : JSON.stringify(reply);
  };
  return Object.assign(fn, { calls });
}

test("planQueries uses the career kinds and domain lists", () => {
  const plans = planQueries(req, now);
  assert.deepEqual(plans.map((p) => p.kind), ["event", "person", "place"]);
  const byKind = Object.fromEntries(plans.map((p) => [p.kind, p]));
  assert.deepEqual(byKind.event.includeDomains, ["luma.com", "lu.ma", "meetup.com", "eventbrite.com", "partiful.com"]);
  assert.deepEqual(byKind.person.includeDomains, ["linkedin.com", "x.com", "github.com"]);
  assert.equal(byKind.place.includeDomains, undefined); // open web
  for (const p of plans) {
    assert.equal(p.afterDate, "2026-10-19");
    assert.equal(p.location, "us");
    assert.equal(p.maxResults, 8);
    assert.ok(p.queries.length >= 2 && p.queries.length <= 3, `${p.kind}: ${p.queries.length} queries`);
    if (p.kind === "event") assert.ok(p.queries.some((q) => /October 2026/.test(q)), "an event query names the month");
    for (const q of p.queries) assert.ok(words(q) >= 3 && words(q) <= 6, `"${q}" has ${words(q)} words`);
    assert.match(p.objective, /San Francisco/);
  }
});

test("planQueries doesn't repeat the city as initials or a word as its plural", () => {
  for (const p of planQueries(req, now)) {
    for (const q of p.queries) {
      assert.ok(!/\bSF\b/.test(q), `"${q}" repeats San Francisco as SF`);
      const stems = q.toLowerCase().split(/\s+/).map((w) => w.replace(/s$/, ""));
      assert.equal(new Set(stems).size, stems.length, `"${q}" repeats a word`);
    }
  }
});

test("planQueries honors explicit kinds and the other areas' defaults", () => {
  assert.deepEqual(planQueries({ ...req, kinds: ["event"] }, now).map((p) => p.kind), ["event"]);
  assert.deepEqual(planQueries({ ...req, area: "health" }, now).map((p) => p.kind), ["place", "group", "event"]);
  assert.deepEqual(planQueries({ ...req, area: "hobbies" }, now).map((p) => p.kind), ["group", "event", "place"]);
  assert.deepEqual(planQueries({ ...req, area: "social" }, now).map((p) => p.kind), ["event", "group"]);
});

test("extract without a model: drops listing pages, dedupes, keeps search facts only", async () => {
  const drafts = await extract(hits, req, now);
  const urls = drafts.map((d) => d.url);
  assert.ok(!urls.includes("https://meetup.com"), "meetup home is a listing page");
  assert.ok(!urls.some((u) => u.includes("/find/")), "meetup /find/ is a listing page");
  assert.ok(!urls.includes("https://luma.com/sf"), "luma city discovery is a listing page");
  assert.equal(urls.filter((u) => u === "https://luma.com/genai-sf").length, 1);
  const odsc = drafts.find((d) => d.url === "https://luma.com/odsc-zylp");
  assert.equal(odsc?.title, "The AI X Leadership Summit | San Francisco 2026");
  assert.equal(odsc?.kind, "event");
  assert.equal(odsc?.source, "luma");
  assert.equal(odsc?.start, undefined); // never guessed without a model
  const calendar = drafts.find((d) => d.url === "https://luma.com/genai-sf");
  assert.equal(calendar?.kind, "group"); // Luma calendars are communities, not single events
  assert.equal(calendar?.title, "Bond AI - San Francisco and Bay Area");
  assert.equal(calendar?.joinMode, "join_group");
  assert.ok(!urls.includes("https://meetup.com/silicon-valley-startup-founder-101"), "the Silicon Valley group never mentions San Francisco");
  for (const d of drafts) {
    assert.equal(d.vetted, false);
    assert.equal(d.area, "career");
    assert.deepEqual(d.citations, [d.url]);
    assert.match(d.id, /^[0-9a-f]{40}$/);
  }
});

test("extract with a model: keeps grounded fields, drops invented URLs, ungrounded facts and out-of-window events", async () => {
  const model = stubModel({
    items: [
      { url: "https://lu.ma/odsc-zylp", title: "The AI X Leadership Summit", start: "2026-10-22T09:00:00-07:00", location: "Hyatt Regency, Burlingame", joinMode: "ticket", hostName: "Cognizant" },
      { url: "https://luma.com/sftw", title: "San Francisco Tech Week", start: "2026-10-05T17:00:00-07:00", joinMode: "rsvp" },
      { url: "https://luma.com/made-up-event", title: "Invented Night", joinMode: "rsvp" },
      { url: "https://lu.ma/genai-sf", title: "Bond AI - San Francisco and Bay Area", joinMode: "teleport" },
    ],
  });
  const drafts = await extract(hits, req, now, model);
  assert.equal(model.calls.length, 1);
  assert.match(model.calls[0], /only facts/i);
  assert.deepEqual(drafts.map((d) => d.url), ["https://luma.com/odsc-zylp", "https://luma.com/genai-sf"]);
  const [odsc, group] = drafts;
  assert.equal(odsc.start, "2026-10-22T09:00:00-07:00");
  assert.equal(odsc.joinMode, "ticket");
  assert.equal(odsc.location, undefined, "location isn't in the excerpts");
  assert.equal(odsc.host?.name, "Cognizant", "host name is in the excerpts");
  assert.equal(group.joinMode, "join_group", "unknown joinMode falls back to the default");
});

test("extract falls back to the template when the model returns junk or throws", async () => {
  const plain = await extract(hits, req, now);
  assert.deepEqual(await extract(hits, req, now, stubModel("not json")), plain);
  const throwing: ModelFn = async () => { throw new Error("LLM 500"); };
  assert.deepEqual(await extract(hits, req, now, throwing), plain);
  const nothing: ModelFn = async () => null;
  assert.deepEqual(await extract(hits, req, now, nothing), plain);
});

const draft = (slug: string, title: string): Opportunity => ({
  id: slug, kind: "event", source: "luma", area: "career", title, url: `https://luma.com/${slug}`,
  joinMode: "rsvp", whyMatch: "", citations: [`https://luma.com/${slug}`], vetted: false,
});
const drafts = [draft("a", "Alpha"), draft("b", "Beta"), draft("c", "Gamma")];

test("rank with a model reorders, caps whyMatch at 20 words, ignores unknown ids and appends missing ones", async () => {
  const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo";
  const model = stubModel({ ranked: [{ id: "c", whyMatch: "Founders demo here weekly." }, { id: "zzz", whyMatch: "x" }, { id: "a", whyMatch: long }] });
  const ranked = await rank(drafts, req, model);
  assert.deepEqual(ranked.map((o) => o.id), ["c", "a", "b"]);
  assert.equal(ranked[0].whyMatch, "Founders demo here weekly.");
  assert.equal(words(ranked[1].whyMatch), 20);
  assert.ok(ranked[2].whyMatch.length > 0, "a missing item still gets a template whyMatch");
});

test("rank without a model keeps search order with a template whyMatch of at most 20 words", async () => {
  const ranked = await rank(drafts, req);
  assert.deepEqual(ranked.map((o) => o.id), ["a", "b", "c"]);
  for (const o of ranked) {
    assert.ok(o.whyMatch.length > 0);
    assert.ok(words(o.whyMatch) <= 20);
  }
});

const page = (url: string, title: string, excerpt: string, kind: Hit["kind"] = "event"): Hit => ({ url, title, publish_date: null, excerpts: [excerpt], kind });

test("extract drops pages that never mention the city, and accepts SF and Bay Area for San Francisco", async () => {
  const drafts = await extract([
    page("https://bhiveph.com/home", "The Bouldering Hive", "Bouldering gym in Manila", "place"),
    page("https://example.com/climb-sf", "Climb Night", "Every Tuesday in SF", "event"),
    page("https://example.com/bay", "Bay Boulders", "Bouldering for the Bay Area", "place"),
    page("https://example.com/mission", "Mission Cliffs", "2295 Harrison Street, San Francisco", "place"),
  ], req, now);
  assert.deepEqual(drafts.map((d) => d.url), ["https://example.com/climb-sf", "https://example.com/bay", "https://example.com/mission"]);
});

test("extract keeps only profile pages as people, and never turns a post into an opportunity", async () => {
  const drafts = await extract([
    page("https://x.com/EWOR_official/status/2112069460559323264", "EWOR on X: Founders, build with us", "founders in San Francisco", "person"),
    page("https://www.linkedin.com/posts/someone_ai-activity-1", "A post about SF AI", "San Francisco AI founders", "person"),
    page("https://www.linkedin.com/in/jane-builder", "Jane Builder - Founder", "AI founder in San Francisco", "person"),
    page("https://github.com/janebuilds", "janebuilds", "Building voice agents in San Francisco", "person"),
  ], req, now);
  assert.deepEqual(drafts.map((d) => d.url), ["https://linkedin.com/in/jane-builder", "https://github.com/janebuilds"]);
});

test("extract drops aggregator listing pages by title", async () => {
  const drafts = await extract([
    page("https://cerebralvalley.ai/events/san-francisco", "AI Events in San Francisco – Cerebral Valley", "San Francisco", "place"),
    page("https://foundercal.com/cities/sf/meetups", "57 meetups for founders in San Francisco · October 2026 · foundercal", "SF", "place"),
    page("https://climbinggyms.org/california/san-francisco", "Climbing Gyms in San Francisco, CA — 8 Places to Climb", "San Francisco", "place"),
    page("https://northcountryclimbing.com/n3c-events", "Events for October 2026 – North Country Climbing Center", "San Francisco", "event"),
    page("https://touchstoneclimbing.com/mission-cliffs", "Mission Cliffs - San Francisco - Touchstone Climbing", "San Francisco", "place"),
  ], req, now);
  assert.deepEqual(drafts.map((d) => d.url), ["https://touchstoneclimbing.com/mission-cliffs"]);
});
