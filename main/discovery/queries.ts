// Per-area search plans: which kinds to look for, which domains, and 2-3 short keyword queries each.
import type { GoalArea } from "../../lib/types.ts";
import type { DiscoverRequest, OpportunityKind } from "./types.ts";

export type SearchPlan = {
  kind: OpportunityKind;
  objective: string;
  queries: string[]; // 2 to 3 queries of 3 to 6 words
  includeDomains?: string[]; // undefined = open web
  afterDate: string; // YYYY-MM-DD
  location: string;
  maxResults: number;
};

const EVENT_SITES = ["luma.com", "lu.ma", "meetup.com", "eventbrite.com", "partiful.com"];

// From the spec's area table. Both Luma hosts stay in include_domains because Search returns either.
const AREAS: Record<GoalArea, { kinds: OpportunityKind[]; domains: Partial<Record<OpportunityKind, string[]>>; placeNouns: [string, string] }> = {
  career: {
    kinds: ["event", "person", "place"],
    domains: { event: EVENT_SITES, person: ["linkedin.com", "x.com", "github.com"] },
    placeNouns: ["coworking space", "cafe"],
  },
  health: {
    kinds: ["place", "group", "event"],
    domains: { group: ["meetup.com"] },
    placeNouns: ["gym", "studio"],
  },
  hobbies: {
    kinds: ["group", "event", "place"],
    domains: { group: ["meetup.com"], event: ["meetup.com", "eventbrite.com", "luma.com", "lu.ma"] },
    placeNouns: ["studio", "club"],
  },
  social: {
    kinds: ["event", "group"],
    domains: { event: ["partiful.com", "luma.com", "lu.ma", "meetup.com"], group: ["meetup.com"] },
    placeNouns: ["bar", "venue"],
  },
};

const KIND_NOUNS: Record<Exclude<OpportunityKind, "place">, [string, string]> = {
  event: ["events", "meetup"],
  group: ["community", "club"],
  person: ["founders", "builders"],
};

const KIND_PHRASE: Record<OpportunityKind, string> = {
  event: "In-person events",
  group: "Groups and communities that meet in person",
  place: "Places to spend time",
  person: "Public profiles of people",
};

// Filler words that make keyword queries worse; Search works best on 3-6 content words.
const STOP = new Set(
  "a an and the of to in on for with at by from into my me i you your our we be become get find more some like part want wanting need twice week weekly this that who whose about around".split(" "),
);

function keywords(goal: string): string[] {
  return goal.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
}

const stem = (w: string) => w.toLowerCase().replace(/s$/, "");

function query(kw: string[], noun: string, city: string[]): string {
  const nounWords = noun.split(" ");
  // The city is always appended, so drop goal words that repeat it ("SF" for San Francisco)
  // or the noun ("founder" next to "founders").
  const initials = city.length > 1 ? city.map((w) => w[0]).join("").toLowerCase() : "";
  const taken = new Set([...nounWords, ...city].map(stem));
  const own = kw.filter((w) => !taken.has(stem(w)) && w.toLowerCase() !== initials);
  const budget = Math.max(0, 6 - nounWords.length - city.length);
  const words = [...own.slice(0, Math.min(3, budget)), ...nounWords, ...city];
  if (words.length < 3) words.unshift("local");
  return words.join(" ");
}

export function planQueries(req: DiscoverRequest, now: Date): SearchPlan[] {
  const area = AREAS[req.area];
  const kw = keywords(req.goal);
  const city = req.city.trim().split(/\s+/).slice(0, 2);
  const afterDate = now.toISOString().slice(0, 10);
  return (req.kinds ?? area.kinds).map((kind) => {
    const nouns = kind === "place" ? area.placeNouns : KIND_NOUNS[kind];
    const queries = [...new Set(nouns.map((n) => query(kw, n, city)))];
    const when = kind === "event" ? ` in the next ${req.windowDays} days` : "";
    return {
      kind,
      objective: `${KIND_PHRASE[kind]} in ${req.city}${when} for someone whose goal is: ${req.goal}.${req.context ? ` Context: ${req.context}` : ""}`,
      queries,
      ...(area.domains[kind] ? { includeDomains: area.domains[kind] } : {}),
      afterDate,
      location: "us",
      maxResults: 8,
    };
  });
}
