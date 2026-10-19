import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, isOpportunity, opportunityId } from "../../main/discovery/normalize.ts";
import { loadFixtures } from "../../main/discovery/cache.ts";
import type { Opportunity } from "../../main/discovery/types.ts";

const good: Opportunity = {
  id: opportunityId("https://luma.com/x"), kind: "event", source: "luma", area: "career", title: "X",
  url: "https://luma.com/x", start: "2026-10-22T18:00:00-07:00", joinMode: "rsvp", whyMatch: "Fits.",
  citations: ["https://luma.com/x"], vetted: false,
};

test("isOpportunity accepts a well-formed opportunity", () => {
  assert.equal(isOpportunity(good), true);
});

test("isOpportunity rejects each kind of bad field", () => {
  const bad: [string, unknown][] = [
    ["null", null],
    ["no citations", { ...good, citations: [] }],
    ["non-canonical url", { ...good, url: "https://lu.ma/x" }],
    ["id not the sha1 of the url", { ...good, id: "abc" }],
    ["unknown kind", { ...good, kind: "party" }],
    ["unknown source", { ...good, source: "myspace" }],
    ["unknown area", { ...good, area: "finance" }],
    ["unknown joinMode", { ...good, joinMode: "teleport" }],
    ["empty title", { ...good, title: " " }],
    ["unparseable start", { ...good, start: "Thursday-ish" }],
    ["vetted not boolean", { ...good, vetted: "no" }],
    ["host without a name", { ...good, host: { url: "https://x.com" } }],
  ];
  for (const [why, value] of bad) assert.equal(isOpportunity(value), false, why);
});

test("career and health fixtures pass the guard and meet the mock-mode minimums", () => {
  const career = loadFixtures("career");
  const health = loadFixtures("health");
  for (const o of [...career, ...health]) {
    assert.equal(isOpportunity(o), true, o.title);
    assert.equal(o.url, canonicalUrl(o.url));
    assert.ok(o.whyMatch.split(/\s+/).length <= 20, `${o.title}: whyMatch over 20 words`);
  }
  assert.ok(career.length >= 3);
  assert.ok(health.filter((o) => o.kind === "place" || o.kind === "group").length >= 2);
  assert.ok(career.every((o) => o.area === "career") && health.every((o) => o.area === "health"));
  // The spec bans committing real people's data, so fixtures carry no person cards.
  assert.ok([...career, ...health].every((o) => o.kind !== "person"));
});

test("areas without fixtures return an empty list", () => {
  assert.deepEqual(loadFixtures("social"), []);
});
