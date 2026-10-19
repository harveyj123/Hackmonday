import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheDir, cacheKey, readCache, resolveMode, writeCache } from "../../main/discovery/cache.ts";
import { loadFixtures } from "../../main/discovery/cache.ts";
import type { DiscoverRequest } from "../../main/discovery/types.ts";

const req: DiscoverRequest = { area: "career", goal: "become part of the SF AI founder scene", city: "San Francisco", windowDays: 7 };
const tmp = () => mkdtempSync(join(tmpdir(), "nomi-cache-"));
const opps = loadFixtures("career");

test("resolveMode defaults to live with a key and mock without one", () => {
  assert.equal(resolveMode({ PARALLEL_API_KEY: "k" }), "live");
  assert.equal(resolveMode({}), "mock");
  assert.equal(resolveMode({ NOMI_DISCOVERY_MODE: "live" }), "mock");
});

test("resolveMode honors cache and mock even without a key, and ignores junk values", () => {
  assert.equal(resolveMode({ NOMI_DISCOVERY_MODE: "cache" }), "cache");
  assert.equal(resolveMode({ NOMI_DISCOVERY_MODE: "mock", PARALLEL_API_KEY: "k" }), "mock");
  assert.equal(resolveMode({ NOMI_DISCOVERY_MODE: "turbo", PARALLEL_API_KEY: "k" }), "live");
});

test("cacheDir uses the override, else data/cache/discovery", () => {
  assert.equal(cacheDir({ NOMI_DISCOVERY_CACHE_DIR: "/x/y" }), "/x/y");
  assert.equal(cacheDir({}), join("data", "cache", "discovery"));
});

test("cacheKey ignores goal casing and spacing and kinds order, but not the area", () => {
  assert.equal(cacheKey(req), cacheKey({ ...req, goal: "  Become part of the SF AI   founder scene " }));
  assert.equal(cacheKey({ ...req, kinds: ["event", "place"] }), cacheKey({ ...req, kinds: ["place", "event"] }));
  assert.notEqual(cacheKey(req), cacheKey({ ...req, area: "social" }));
  assert.notEqual(cacheKey(req), cacheKey({ ...req, windowDays: 3 }));
});

test("writeCache then readCache round-trips the opportunities", () => {
  const dir = tmp();
  writeCache(req, opps, dir, new Date("2026-10-19T19:00:00Z"));
  const hit = readCache(req, dir);
  assert.deepEqual(hit?.opportunities, opps);
  assert.equal(hit?.savedAt, "2026-10-19T19:00:00.000Z");
  assert.equal(readCache({ ...req, goal: "something else" }, dir), null);
});

test("readCache with anyForArea falls back to the newest entry for that area", () => {
  const dir = tmp();
  writeCache({ ...req, goal: "older" }, opps.slice(0, 1), dir, new Date("2026-10-18T00:00:00Z"));
  writeCache({ ...req, goal: "newer" }, opps.slice(0, 2), dir, new Date("2026-10-19T00:00:00Z"));
  writeCache({ ...req, area: "health", goal: "newest" }, loadFixtures("health"), dir, new Date("2026-10-20T00:00:00Z"));
  const hit = readCache({ ...req, goal: "not cached" }, dir, { anyForArea: true });
  assert.equal(hit?.request.goal, "newer");
  assert.equal(hit?.opportunities.length, 2);
});

test("readCache returns null for a missing dir, a corrupt file, or entries that fail the guard", () => {
  assert.equal(readCache(req, join(tmp(), "nope")), null);
  const dir = tmp();
  writeCache(req, opps, dir);
  const [file] = readdirSync(dir);
  writeFileSync(join(dir, file), "{not json");
  assert.equal(readCache(req, dir), null);
  writeFileSync(join(dir, file), JSON.stringify({ savedAt: "x", request: req, opportunities: [{ id: "bad" }] }));
  assert.equal(readCache(req, dir), null);
});
