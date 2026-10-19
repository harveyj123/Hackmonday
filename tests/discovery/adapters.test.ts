import { test } from "node:test";
import assert from "node:assert/strict";
import { toCalendarEvent, toInfoCard } from "../../main/discovery/adapters.ts";
import { buildIcs } from "../../lib/calendar.ts";
import { loadFixtures } from "../../main/discovery/cache.ts";
import type { Opportunity } from "../../main/discovery/types.ts";

const base: Opportunity = {
  id: "x", kind: "event", source: "luma", area: "career", title: "AI Founders Night", url: "https://luma.com/x",
  joinMode: "request", whyMatch: "Builders like Priya go here.", citations: ["https://luma.com/x"], vetted: true,
};

test("toInfoCard builds the spec's subtitle from local start time, neighborhood and who goes", () => {
  const card = toInfoCard({ ...base, start: "2026-10-22T19:00:00-07:00", location: "SoMa, San Francisco", whoGoes: "~30 builders" });
  assert.deepEqual(card, { title: "AI Founders Night", subtitle: "Thu 7pm · SoMa · ~30 builders", url: "https://luma.com/x", cta: "Request to join" });
});

test("toInfoCard keeps minutes, uses the event's own UTC offset, and skips missing parts", () => {
  assert.equal(toInfoCard({ ...base, start: "2026-10-21T18:30:00-07:00" }).subtitle, "Wed 6:30pm");
  // Only the string's own offset is used (no guessing the city's zone), so a Z time shows in UTC.
  assert.equal(toInfoCard({ ...base, start: "2026-10-22T01:00:00Z", location: "Mission" }).subtitle, "Thu 1am · Mission");
  assert.equal(toInfoCard({ ...base, start: "2026-10-22T12:00:00-07:00" }).subtitle, "Thu 12pm");
});

test("toInfoCard for places and groups uses the kind and location, with a matching call to action", () => {
  assert.deepEqual(toInfoCard({ ...base, kind: "place", joinMode: "dropin", location: "2295 Harrison Street, San Francisco" }), {
    title: "AI Founders Night", subtitle: "Place · 2295 Harrison Street", url: "https://luma.com/x", cta: "View place",
  });
  assert.equal(toInfoCard({ ...base, kind: "group", joinMode: "join_group" }).subtitle, "Community");
  assert.equal(toInfoCard({ ...base, kind: "group", joinMode: "join_group" }).cta, "Join group");
});

test("toInfoCard caps whoGoes so the subtitle fits a card", () => {
  const card = toInfoCard({ ...base, whoGoes: "Enterprise AI leaders, including VP-level leaders and practitioners from big companies" });
  assert.ok(card.subtitle!.length <= 60, card.subtitle);
  assert.match(card.subtitle!, /…$/);
});

test("toCalendarEvent defaults to a 2-hour slot in the event's own offset", () => {
  const e = toCalendarEvent({ ...base, start: "2026-10-22T18:00:00-07:00", location: "SoMa" });
  assert.deepEqual(e, {
    title: "AI Founders Night",
    start: "2026-10-22T18:00:00-07:00",
    end: "2026-10-22T20:00:00-07:00",
    location: "SoMa",
    url: "https://luma.com/x",
    notes: "Builders like Priya go here.\nhttps://luma.com/x",
  });
});

test("toCalendarEvent keeps a real end, and returns null without a start or for non-events", () => {
  assert.equal(toCalendarEvent({ ...base, start: "2026-10-21T18:00:00-07:00", end: "2026-10-21T22:00:00-07:00" })?.end, "2026-10-21T22:00:00-07:00");
  assert.equal(toCalendarEvent(base), null);
  assert.equal(toCalendarEvent({ ...base, kind: "place", start: "2026-10-22T18:00:00-07:00" }), null);
});

test("toCalendarEvent output feeds buildIcs (the calendar_hold payload) directly", () => {
  const [hackers] = loadFixtures("career").filter((o) => o.title.startsWith("Hackers"));
  const ics = buildIcs(toCalendarEvent(hackers)!);
  assert.match(ics, /DTSTART:20261022T010000Z/);
  assert.match(ics, /DTEND:20261022T050000Z/);
  assert.match(ics, /SUMMARY:Hackers and Founders San Francisco/);
});

test("every fixture becomes a card with a title and url", () => {
  for (const o of [...loadFixtures("career"), ...loadFixtures("health")]) {
    const card = toInfoCard(o);
    assert.equal(card.title, o.title);
    assert.equal(card.url, o.url);
  }
});
