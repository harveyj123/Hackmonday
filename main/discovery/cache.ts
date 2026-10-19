// Discovery modes, the on-disk cache and the bundled fixtures.
// The cache dir is data/cache/discovery in scripts (gitignored); the Electron main process should
// pass a folder under app.getPath("userData") via NOMI_DISCOVERY_CACHE_DIR (pending port).
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GoalArea } from "../../lib/types.ts";
import type { DiscoverRequest, Opportunity } from "./types.ts";
import { isOpportunity } from "./normalize.ts";
// JSON imports get bundled by the port's build, unlike paths resolved at runtime.
import careerFixtures from "../../fixtures/discovery/career.json" with { type: "json" };
import healthFixtures from "../../fixtures/discovery/health.json" with { type: "json" };

export type DiscoveryMode = "live" | "cache" | "mock";

type Env = Record<string, string | undefined>;

// No key means live can't work, so fall to mock; cache replay never needs the network.
export function resolveMode(env: Env = process.env): DiscoveryMode {
  const raw = env.NOMI_DISCOVERY_MODE;
  const mode: DiscoveryMode = raw === "cache" || raw === "mock" ? raw : "live";
  return mode === "live" && !env.PARALLEL_API_KEY ? "mock" : mode;
}

export function cacheDir(env: Env = process.env): string {
  return env.NOMI_DISCOVERY_CACHE_DIR || join("data", "cache", "discovery");
}

// Same intent typed slightly differently should hit the same entry.
export function cacheKey(req: DiscoverRequest): string {
  const norm = {
    area: req.area,
    goal: req.goal.trim().toLowerCase().replace(/\s+/g, " "),
    city: req.city.trim().toLowerCase(),
    windowDays: req.windowDays,
    kinds: [...(req.kinds ?? [])].sort(),
    limit: req.limit ?? 5,
  };
  return createHash("sha1").update(JSON.stringify(norm)).digest("hex");
}

export type CacheEntry = { savedAt: string; request: DiscoverRequest; opportunities: Opportunity[] };

function parseEntry(path: string): CacheEntry | null {
  try {
    const e = JSON.parse(readFileSync(path, "utf8"));
    if (typeof e?.savedAt !== "string" || !e.request || !Array.isArray(e.opportunities)) return null;
    if (!e.opportunities.every(isOpportunity)) return null;
    return e as CacheEntry;
  } catch {
    return null;
  }
}

export function writeCache(req: DiscoverRequest, opportunities: Opportunity[], dir: string = cacheDir(), now: Date = new Date()): void {
  mkdirSync(dir, { recursive: true });
  const entry: CacheEntry = { savedAt: now.toISOString(), request: req, opportunities };
  writeFileSync(join(dir, `${cacheKey(req)}.json`), JSON.stringify(entry, null, 2) + "\n");
}

// anyForArea is the "wifi died" path: if this exact request was never cached, replay the newest
// entry for the same area rather than showing nothing.
export function readCache(req: DiscoverRequest, dir: string = cacheDir(), opts: { anyForArea?: boolean } = {}): CacheEntry | null {
  const exact = parseEntry(join(dir, `${cacheKey(req)}.json`));
  if (exact || !opts.anyForArea) return exact;
  let files: string[];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return null; }
  let best: CacheEntry | null = null;
  for (const f of files) {
    const e = parseEntry(join(dir, f));
    if (e && e.request.area === req.area && (!best || e.savedAt > best.savedAt)) best = e;
  }
  return best;
}

const FIXTURES: Partial<Record<GoalArea, unknown[]>> = { career: careerFixtures, health: healthFixtures };

export function loadFixtures(area: GoalArea): Opportunity[] {
  return (FIXTURES[area] ?? []).filter(isOpportunity);
}
