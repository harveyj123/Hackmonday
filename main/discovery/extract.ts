// Turns Search hits into draft opportunities (extract) and orders them with a reason (rank).
// The model is injected (same shape as chat() in lib/llm.ts); without one, both fall back to templates.
import type { DiscoverRequest, JoinMode, Opportunity, OpportunityKind, OpportunitySource } from "./types.ts";
import type { SearchResult } from "./parallel.ts";
import { canonicalUrl, dedupe, inWindow, opportunityId } from "./normalize.ts";

export type ModelFn = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts?: { json?: boolean },
) => Promise<string | null>;

export type Hit = SearchResult & { kind: OpportunityKind };

const JOIN_MODES: JoinMode[] = ["rsvp", "request", "ticket", "join_group", "dropin", "contact", "connect"];

function sourceOf(host: string): OpportunitySource {
  if (host === "luma.com") return "luma";
  if (host === "meetup.com") return "meetup";
  if (host.startsWith("eventbrite.")) return "eventbrite";
  if (host === "partiful.com") return "partiful";
  if (host === "linkedin.com") return "linkedin";
  return "web";
}

// Directory and search pages aren't something you can walk into; their excerpts mix many events.
function isListing(u: URL, title: string): boolean {
  if (u.pathname === "/") return true;
  if (u.hostname === "meetup.com" && u.pathname.startsWith("/find")) return true;
  if (u.hostname.startsWith("eventbrite.") && u.pathname.startsWith("/d/")) return true;
  return /^popular events in /i.test(title);
}

// A Luma calendar or a Meetup group page is a community to join, whatever kind the query asked for.
function kindOf(u: URL, title: string, asked: OpportunityKind): OpportunityKind {
  if (u.hostname === "luma.com" && /· events calendar$/i.test(title)) return "group";
  if (u.hostname === "meetup.com") return /\/events\/\d+/.test(u.pathname) ? "event" : "group";
  return asked;
}

function cleanTitle(title: string): string {
  return title.replace(/\s*(· Events Calendar|\| Meetup|- Meetup|\| Eventbrite|\| Partiful)\s*$/i, "").trim();
}

function defaultJoinMode(kind: OpportunityKind, source: OpportunitySource): JoinMode {
  if (kind === "group") return "join_group";
  if (kind === "place") return "dropin";
  if (kind === "person") return source === "linkedin" ? "connect" : "contact";
  return source === "eventbrite" ? "ticket" : "rsvp";
}

type Base = { draft: Opportunity; text: string };

function baseDrafts(hits: Hit[], req: DiscoverRequest): Base[] {
  const out: Base[] = [];
  for (const hit of dedupe(hits)) {
    const url = canonicalUrl(hit.url);
    const u = new URL(url);
    const rawTitle = hit.title ?? "";
    if (isListing(u, rawTitle)) continue;
    const kind = kindOf(u, rawTitle, hit.kind);
    const source = sourceOf(u.hostname);
    out.push({
      draft: {
        id: opportunityId(url),
        kind,
        source,
        area: req.area,
        title: cleanTitle(rawTitle) || u.hostname + u.pathname,
        url,
        joinMode: defaultJoinMode(kind, source),
        whyMatch: "",
        citations: [url],
        vetted: false,
      },
      text: `${rawTitle}\n${hit.excerpts.join("\n")}`.toLowerCase(),
    });
  }
  return out;
}

function parseJson(raw: string | null): any {
  if (!raw) return null;
  try { return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return null; }
}

// A string fact only counts if it appears in what Search returned for that page.
const grounded = (value: unknown, text: string): value is string =>
  typeof value === "string" && value.trim() !== "" && text.includes(value.trim().toLowerCase());

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

const EXTRACT_PROMPT = `You read web search results about things to do and extract details for each relevant one.
Use only facts present in the given title and excerpts. Leave a field out when the page doesn't state it. Never invent URLs.
Skip results that aren't in the user's city, have already happened, or don't fit the goal.
Reply with JSON only: {"items":[{"url":string,"title":string,"start"?:string,"end"?:string,"location"?:string,"joinMode"?:string,"hostName"?:string}]}
- url: copied exactly from the input
- start/end: ISO 8601 with the local UTC offset
- joinMode: one of ${JOIN_MODES.join(", ")}`;

export async function extract(hits: Hit[], req: DiscoverRequest, now: Date, model?: ModelFn): Promise<Opportunity[]> {
  const bases = baseDrafts(hits, req);
  const template = bases.map((b) => b.draft);
  if (!model || bases.length === 0) return template;

  let parsed: any = null;
  try {
    parsed = parseJson(
      await model(
        [
          { role: "system", content: EXTRACT_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              today: now.toISOString(),
              windowDays: req.windowDays,
              city: req.city,
              goal: req.goal,
              results: hits.map((h) => ({ url: h.url, title: h.title, excerpts: h.excerpts.join(" ").slice(0, 1500) })),
            }),
          },
        ],
        { json: true },
      ),
    );
  } catch {
    return template;
  }
  const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) return template;

  const byUrl = new Map(bases.map((b) => [b.draft.url, b]));
  const seen = new Set<string>();
  const out: Opportunity[] = [];
  for (const item of items as Record<string, unknown>[]) {
    let url: string;
    try { url = canonicalUrl(String(item.url)); } catch { continue; }
    const base = byUrl.get(url);
    if (!base || seen.has(url)) continue; // the model may only pick from what Search returned
    seen.add(url);
    const o: Opportunity = { ...base.draft };
    if (grounded(item.title, base.text)) o.title = item.title.trim();
    if (isDate(item.start)) o.start = item.start;
    if (isDate(item.end)) o.end = item.end;
    if (grounded(item.location, base.text)) o.location = item.location.trim();
    if (grounded(item.hostName, base.text)) o.host = { name: item.hostName.trim() };
    if (JOIN_MODES.includes(item.joinMode as JoinMode)) o.joinMode = item.joinMode as JoinMode;
    if (!inWindow(o.start, now, req.windowDays, o.end)) continue;
    out.push(o);
  }
  return out;
}

const cap20 = (s: string) => s.trim().split(/\s+/).slice(0, 20).join(" ");

const KIND_LABEL: Record<OpportunityKind, string> = { event: "An event", group: "A community", place: "A place", person: "Someone" };

function templateWhy(o: Opportunity, req: DiscoverRequest): string {
  return cap20(`${KIND_LABEL[o.kind]} in ${req.city} that fits your goal: ${req.goal}`);
}

const RANK_PROMPT = `Order these options by how well they move the user toward their goal this week, best first.
For each, write whyMatch: one friendly sentence of at most 20 words tied to the goal, using only the given facts.
Reply with JSON only: {"ranked":[{"id":string,"whyMatch":string}]}`;

export async function rank(drafts: Opportunity[], req: DiscoverRequest, model?: ModelFn): Promise<Opportunity[]> {
  const withTemplate = drafts.map((o) => ({ ...o, whyMatch: templateWhy(o, req) }));
  if (!model || drafts.length === 0) return withTemplate;

  let parsed: any = null;
  try {
    parsed = parseJson(
      await model(
        [
          { role: "system", content: RANK_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              goal: req.goal,
              context: req.context,
              city: req.city,
              options: drafts.map((o) => ({ id: o.id, kind: o.kind, title: o.title, start: o.start, location: o.location, host: o.host?.name })),
            }),
          },
        ],
        { json: true },
      ),
    );
  } catch {
    return withTemplate;
  }
  const ranked: Record<string, unknown>[] = Array.isArray(parsed?.ranked) ? parsed.ranked : [];
  const byId = new Map(withTemplate.map((o) => [o.id, o]));
  const out: Opportunity[] = [];
  for (const r of ranked) {
    const o = byId.get(String(r.id));
    if (!o) continue;
    byId.delete(o.id);
    out.push(typeof r.whyMatch === "string" && r.whyMatch.trim() ? { ...o, whyMatch: cap20(r.whyMatch) } : o);
  }
  // Anything the model skipped keeps its search order after the ranked ones.
  return [...out, ...byId.values()];
}
