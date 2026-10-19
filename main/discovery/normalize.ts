// URL canonicalization, dedupe and date-window filtering for discovery results.
import { createHash } from "node:crypto";
import type { GoalArea } from "../../lib/types.ts";
import type { JoinMode, Opportunity, OpportunityKind, OpportunitySource } from "./types.ts";

// Luma serves the same event on two hosts and appends tracking params; collapse them so dedupe works.
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^lu\.ma$/, "luma.com");
  for (const key of [...u.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "ref") u.searchParams.delete(key);
  }
  u.hash = "";
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  const out = u.toString();
  // URL always prints a bare "/" path; drop it so "https://luma.com/" and "https://luma.com" match.
  return u.pathname === "/" && !u.search ? out.replace(/\/$/, "") : out;
}

export function opportunityId(url: string): string {
  return createHash("sha1").update(canonicalUrl(url)).digest("hex");
}

// Keeps the first item for each canonical URL (Search order is the fallback ranking).
// Items whose URL doesn't parse are dropped rather than thrown on.
export function dedupe<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    let key: string;
    try { key = canonicalUrl(item.url); } catch { continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// Only a known date can rule an item out: places, groups and events with no parsed date stay in.
// An event that already started still counts while it hasn't ended.
export function inWindow(start: string | undefined, now: Date, windowDays: number, end?: string): boolean {
  if (!start) return true;
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return true;
  const endMs = end ? Date.parse(end) : NaN;
  const lastMs = Number.isNaN(endMs) ? startMs : endMs;
  const windowEnd = now.getTime() + windowDays * 24 * 60 * 60 * 1000;
  return lastMs >= now.getTime() && startMs <= windowEnd;
}

const KINDS = ["event", "group", "place", "person"] satisfies OpportunityKind[];
const SOURCES = ["luma", "meetup", "eventbrite", "partiful", "linkedin", "web"] satisfies OpportunitySource[];
const AREAS = ["career", "health", "hobbies", "social"] satisfies GoalArea[];
const JOIN_MODES = ["rsvp", "request", "ticket", "join_group", "dropin", "contact", "connect"] satisfies JoinMode[];

const oneOf = (list: readonly string[], v: unknown) => typeof v === "string" && list.includes(v);
const optDate = (v: unknown) => v === undefined || (typeof v === "string" && !Number.isNaN(Date.parse(v)));
const optString = (v: unknown) => v === undefined || typeof v === "string";

function sameCanonical(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try { return canonicalUrl(url) === url; } catch { return false; }
}

// Runtime check for anything read from disk (fixtures, cache) before it reaches a card.
export function isOpportunity(v: unknown): v is Opportunity {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, any>;
  return (
    sameCanonical(o.url) &&
    o.id === opportunityId(o.url) &&
    oneOf(KINDS, o.kind) &&
    oneOf(SOURCES, o.source) &&
    oneOf(AREAS, o.area) &&
    oneOf(JOIN_MODES, o.joinMode) &&
    typeof o.title === "string" && o.title.trim() !== "" &&
    typeof o.whyMatch === "string" &&
    Array.isArray(o.citations) && o.citations.length > 0 && o.citations.every((c: unknown) => typeof c === "string") &&
    typeof o.vetted === "boolean" &&
    optDate(o.start) && optDate(o.end) &&
    optString(o.location) && optString(o.whoGoes) && optString(o.vibe) &&
    (o.host === undefined || (typeof o.host === "object" && o.host !== null && typeof o.host.name === "string"))
  );
}
