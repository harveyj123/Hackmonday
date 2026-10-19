// discover(): the live path (plan → Search → extract → rank → cache), with cache and fixture
// fallbacks so it never throws on valid input. Vetting with Parallel Task is a separate step (D6).
import { randomUUID } from "node:crypto";
import { chat, llmConfigured } from "../../lib/llm.ts";
import type { DiscoverEvent, DiscoverRequest, DiscoverResult, Opportunity, OpportunityKind } from "./types.ts";
import { search as parallelSearch } from "./parallel.ts";
import { kindPriority, planQueries } from "./queries.ts";
import { extract, rank, type Hit, type ModelFn } from "./extract.ts";
import { cacheDir as defaultCacheDir, loadFixtures, readCache, resolveMode, writeCache } from "./cache.ts";

export type DiscoverDeps = {
  env?: Record<string, string | undefined>;
  now?: () => Date;
  cacheDir?: string;
  search?: typeof parallelSearch;
  model?: ModelFn | null; // undefined = lib/llm.ts when configured, null = templates only
};

const AREAS = ["career", "health", "hobbies", "social"];

const SITE_NAMES: Record<string, string> = {
  "luma.com": "Luma", "lu.ma": "Luma", "meetup.com": "Meetup", "eventbrite.com": "Eventbrite",
  "partiful.com": "Partiful", "linkedin.com": "LinkedIn", "x.com": "X", "github.com": "GitHub",
};

function validate(req: DiscoverRequest): void {
  if (!AREAS.includes(req?.area)) throw new TypeError(`discover: unknown area "${req?.area}"`);
  if (typeof req.goal !== "string" || !req.goal.trim()) throw new TypeError("discover: goal is required");
  if (typeof req.city !== "string" || !req.city.trim()) throw new TypeError("discover: city is required");
  if (!Number.isInteger(req.windowDays) || req.windowDays < 1 || req.windowDays > 31) {
    throw new TypeError("discover: windowDays must be an integer from 1 to 31");
  }
}

// Search order is kept within each kind, but kinds take turns so one search can't fill the list.
function interleave(drafts: Opportunity[], kindOrder: OpportunityKind[]): Opportunity[] {
  const buckets = new Map<OpportunityKind, Opportunity[]>();
  for (const k of kindOrder) buckets.set(k, []);
  for (const o of drafts) {
    if (!buckets.has(o.kind)) buckets.set(o.kind, []);
    buckets.get(o.kind)!.push(o);
  }
  const out: Opportunity[] = [];
  const lists = [...buckets.values()];
  for (let i = 0; out.length < drafts.length; i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

export async function discover(
  req: DiscoverRequest,
  emit: (e: DiscoverEvent) => void = () => {},
  deps: DiscoverDeps = {},
): Promise<DiscoverResult> {
  validate(req);
  const started = performance.now();
  const requestId = randomUUID();
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const dir = deps.cacheDir ?? defaultCacheDir(env);
  const limit = req.limit ?? 5;
  const warnings: string[] = [];
  const done = (opportunities: Opportunity[], mode: DiscoverResult["mode"]): DiscoverResult => ({
    requestId, opportunities: opportunities.slice(0, limit), mode, tookMs: Math.round(performance.now() - started), warnings,
  });
  const progress = (step: "search" | "extract" | "rank", label: string, isDone: boolean) =>
    emit({ requestId, type: "progress", step, label, done: isDone });

  // Same request from cache first, then the bundled fixtures: the "wifi died" chain.
  const fallback = (why: string): DiscoverResult => {
    warnings.push(why);
    const cached = readCache(req, dir, { anyForArea: true });
    if (cached) return done(cached.opportunities, "cache");
    return done(loadFixtures(req.area), "mock");
  };

  const mode = resolveMode(env);
  if (mode === "mock") {
    if (!env.PARALLEL_API_KEY) warnings.push("PARALLEL_API_KEY is not set; showing bundled fixtures");
    return done(loadFixtures(req.area), "mock");
  }
  if (mode === "cache") {
    const cached = readCache(req, dir, { anyForArea: true });
    if (cached) return done(cached.opportunities, "cache");
    warnings.push("nothing cached for this request; showing bundled fixtures");
    return done(loadFixtures(req.area), "mock");
  }

  try {
    const plans = planQueries(req, now);
    const sites = [...new Set(plans.flatMap((p) => (p.includeDomains ?? ["the web"]).map((d) => SITE_NAMES[d] ?? d)))];
    progress("search", `searching ${sites.join(", ")}…`, false);
    const search = deps.search ?? parallelSearch;
    const settled = await Promise.allSettled(
      plans.map((p) => search({ objective: p.objective, queries: p.queries, includeDomains: p.includeDomains, afterDate: p.afterDate, location: p.location, maxResults: p.maxResults })),
    );
    const hits: Hit[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled" && s.value) hits.push(...s.value.map((r) => ({ ...r, kind: plans[i].kind })));
      else warnings.push(`${plans[i].kind} search failed: ${s.status === "rejected" ? String(s.reason?.message ?? s.reason) : "no API key"}`);
    });
    if (settled.every((s) => s.status === "rejected" || !s.value)) return fallback(`search failed: ${warnings.join("; ")}`);
    progress("search", `found ${hits.length} pages`, true);

    const model = deps.model === undefined ? (llmConfigured() ? chat : undefined) : deps.model ?? undefined;
    progress("extract", `reading ${hits.length} pages…`, false);
    const drafts = interleave(await extract(hits, req, now, model), kindPriority(req.area));
    progress("extract", `${drafts.length} candidates`, true);

    progress("rank", "ranking…", false);
    const ranked = (await rank(drafts, req, model)).slice(0, limit);
    progress("rank", "ranked", true);
    if (ranked.length === 0) return fallback("search returned nothing usable");

    try { writeCache(req, ranked, dir); } catch (e) { warnings.push(`cache write failed: ${(e as Error).message}`); }
    return done(ranked, "live");
  } catch (e) {
    return fallback(`discover failed: ${(e as Error).message}`);
  }
}
