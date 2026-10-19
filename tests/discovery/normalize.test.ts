import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, dedupe, inWindow, opportunityId } from "../../main/discovery/normalize.ts";

test("canonicalUrl rewrites lu.ma to luma.com", () => {
  assert.equal(canonicalUrl("https://lu.ma/odsc-zylp"), "https://luma.com/odsc-zylp");
  assert.equal(canonicalUrl("https://www.lu.ma/odsc-zylp"), "https://luma.com/odsc-zylp");
  assert.equal(canonicalUrl("https://luma.com/odsc-zylp"), "https://luma.com/odsc-zylp");
});

test("canonicalUrl lowercases the host and drops www", () => {
  assert.equal(canonicalUrl("https://WWW.Meetup.com/hackers-founders/"), "https://meetup.com/hackers-founders");
});

test("canonicalUrl strips utm_* and ref but keeps other params", () => {
  assert.equal(
    canonicalUrl("https://luma.com/sf?utm_source=x&utm_medium=y&ref=abc&tk=keep"),
    "https://luma.com/sf?tk=keep",
  );
});

test("canonicalUrl drops the hash and trailing slashes", () => {
  assert.equal(canonicalUrl("https://meetup.com/group/events/123/#top"), "https://meetup.com/group/events/123");
  assert.equal(canonicalUrl("https://meetup.com/group/?a=1"), "https://meetup.com/group?a=1");
  assert.equal(canonicalUrl("https://luma.com/"), "https://luma.com");
});

test("canonicalUrl throws on invalid input", () => {
  assert.throws(() => canonicalUrl("not a url"));
});

test("opportunityId is a stable sha1 of the canonical url", () => {
  const a = opportunityId("https://lu.ma/odsc-zylp?utm_source=x");
  const b = opportunityId("https://luma.com/odsc-zylp");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.notEqual(a, opportunityId("https://luma.com/sf"));
});

test("dedupe keeps the first item per canonical url and drops unparseable urls", () => {
  const items = [
    { url: "https://lu.ma/genai-sf", n: 1 },
    { url: "https://luma.com/genai-sf/", n: 2 },
    { url: "https://luma.com/sftw", n: 3 },
    { url: "nope", n: 4 },
    { url: "https://luma.com/sftw?utm_campaign=z", n: 5 },
  ];
  assert.deepEqual(dedupe(items).map((i) => i.n), [1, 3]);
});

test("dedupe on the D0 search recording collapses the lu.ma/luma.com pair", async () => {
  const { default: rec } = await import("./recordings/search-career.json", { with: { type: "json" } });
  const results = rec.response.results as { url: string }[];
  const unique = dedupe(results);
  const canon = unique.map((r) => canonicalUrl(r.url));
  assert.equal(new Set(canon).size, canon.length);
  assert.equal(canon.filter((u) => u === "https://luma.com/genai-sf").length, 1);
  assert.ok(unique.length < results.length);
});

const now = new Date("2026-10-19T12:00:00-07:00");

test("inWindow keeps events inside the window", () => {
  assert.equal(inWindow("2026-10-21T18:00:00-07:00", now, 7), true);
  assert.equal(inWindow("2026-10-26T11:00:00-07:00", now, 7), true);
});

test("inWindow drops events before now or after the window", () => {
  assert.equal(inWindow("2026-10-18T18:00:00-07:00", now, 7), false);
  assert.equal(inWindow("2026-10-26T13:00:00-07:00", now, 7), false);
});

test("inWindow keeps an event that started earlier today but hasn't ended", () => {
  assert.equal(inWindow("2026-10-19T10:00:00-07:00", now, 7, "2026-10-19T14:00:00-07:00"), true);
});

test("inWindow keeps items without a usable date (not an event, or date unknown)", () => {
  assert.equal(inWindow(undefined, now, 7), true);
  assert.equal(inWindow("", now, 7), true);
  assert.equal(inWindow("sometime soon", now, 7), true);
});
