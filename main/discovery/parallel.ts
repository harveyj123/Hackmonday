// Parallel client for discovery: Search (live path), Task (background vetting), FindAll (pre-warm only).
// Shapes checked against docs.parallel.ai on Oct 19. Every call returns null when no key is set.
// search() mirrors lib/parallel.ts (the Bots teammate's file) and adds afterDate and location,
// so discovery doesn't edit a shared file.

const API = "https://api.parallel.ai";

export type SearchResult = { url: string; title: string | null; publish_date: string | null; excerpts: string[] };

export type Citation = { url: string; title?: string | null; excerpts?: string[] };
export type Basis = { field: string; citations?: Citation[]; reasoning: string; confidence?: "low" | "medium" | "high" | null };

export type TaskResult<T> = { runId: string; content: T; basis: Basis[] };

export type FindAllCandidate = {
  candidate_id: string;
  name: string;
  url: string;
  description: string | null;
  match_status: "generated" | "matched" | "unmatched" | "discarded";
  // Docs show both {value, is_matched} objects and plain strings per match condition.
  output: Record<string, unknown>;
  basis: Basis[];
};

export type FindAllResult = {
  findallId: string;
  candidates: FindAllCandidate[]; // matched only
  complete: boolean; // false when the deadline passed and this is a partial snapshot
  terminationReason: string | null;
};

type FindAllRun = { findall_id: string; status: { status: string; is_active: boolean; termination_reason?: string | null } };

function key(): string | null {
  return process.env.PARALLEL_API_KEY || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Error bodies never echo the key, so including them in the message is safe.
async function call(apiKey: string, method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json: json ?? text };
}

function fail(what: string, status: number, json: unknown): never {
  const detail = typeof json === "string" ? json : JSON.stringify(json);
  throw new Error(`Parallel ${what} ${status}: ${detail.slice(0, 300)}`);
}

// Search rejects unknown keys (additionalProperties: false), so only send what was asked for.
export async function search(req: {
  objective: string;
  queries: string[]; // 2 to 3 keyword queries of 3 to 6 words work best
  maxResults?: number;
  includeDomains?: string[];
  afterDate?: string; // YYYY-MM-DD
  location?: string; // ISO 3166-1 alpha-2, e.g. "us"
}): Promise<SearchResult[] | null> {
  const apiKey = key();
  if (!apiKey) return null;
  const sourcePolicy = {
    ...(req.includeDomains ? { include_domains: req.includeDomains } : {}),
    ...(req.afterDate ? { after_date: req.afterDate } : {}),
  };
  const { status, json } = await call(apiKey, "POST", "/v1/search", {
    objective: req.objective,
    search_queries: req.queries,
    mode: "fast",
    advanced_settings: {
      ...(Object.keys(sourcePolicy).length ? { source_policy: sourcePolicy } : {}),
      ...(req.location ? { location: req.location } : {}),
      max_results: req.maxResults ?? 5,
    },
  });
  if (status !== 200) fail("search", status, json);
  return json.results;
}

// Task is slow (lite p50 ~45 s), so callers run it in the background. /result long-polls for
// `timeoutS` seconds and answers 408 while the run is active; we ask again until `deadlineMs`.
// Returns null when the deadline passes so vet() can leave the card as it is.
export async function taskRun<T = Record<string, unknown>>(
  req: { input: string | Record<string, unknown>; jsonSchema: Record<string, unknown>; processor?: "lite" | "base" },
  opts: { timeoutS?: number; deadlineMs?: number } = {},
): Promise<TaskResult<T> | null> {
  const apiKey = key();
  if (!apiKey) return null;
  const created = await call(apiKey, "POST", "/v1/tasks/runs", {
    processor: req.processor ?? "lite",
    input: req.input,
    task_spec: { output_schema: { type: "json", json_schema: req.jsonSchema } },
  });
  if (created.status !== 200 && created.status !== 202) fail("task create", created.status, created.json);
  const runId: string = created.json.run_id;

  const started = Date.now();
  const deadlineMs = opts.deadlineMs ?? 4 * 60_000;
  const timeoutS = opts.timeoutS ?? 30;
  for (;;) {
    const result = await call(apiKey, "GET", `/v1/tasks/runs/${runId}/result?timeout=${timeoutS}`);
    if (result.status === 200) return { runId, content: result.json.output.content, basis: result.json.output.basis ?? [] };
    if (result.status !== 408) fail("task result", result.status, result.json);
    if (Date.now() - started >= deadlineMs) return null;
  }
}

// FindAll runs for minutes, so it's pre-warm only (warm.ts), never the live path.
// Generators above "base" cost more and need an OK first, so this only offers base.
export async function findAll(
  req: {
    objective: string;
    entityType: string;
    matchConditions: { name: string; description: string }[];
    matchLimit?: number; // 5 to 1000
  },
  opts: { pollMs?: number; deadlineMs?: number } = {},
): Promise<FindAllResult | null> {
  const matchLimit = req.matchLimit ?? 10;
  if (matchLimit < 5 || matchLimit > 1000) throw new Error(`FindAll match_limit must be 5 to 1000, got ${matchLimit}`);
  const apiKey = key();
  if (!apiKey) return null;
  const created = await call(apiKey, "POST", "/v1beta/findall/runs", {
    objective: req.objective,
    entity_type: req.entityType,
    match_conditions: req.matchConditions,
    generator: "base",
    match_limit: matchLimit,
  });
  if (created.status !== 200 && created.status !== 202) fail("findall create", created.status, created.json);
  let run: FindAllRun = created.json;
  const id = run.findall_id;

  const started = Date.now();
  const deadlineMs = opts.deadlineMs ?? 10 * 60_000;
  const pollMs = opts.pollMs ?? 5_000;
  while (run.status.is_active) {
    if (Date.now() - started >= deadlineMs) break;
    await sleep(pollMs);
    const polled = await call(apiKey, "GET", `/v1beta/findall/runs/${id}`);
    if (polled.status !== 200) fail("findall status", polled.status, polled.json);
    run = polled.json;
  }

  // The snapshot works mid-run too, so a deadline still yields whatever matched so far.
  const snap = await call(apiKey, "GET", `/v1beta/findall/runs/${id}/result`);
  if (snap.status !== 200) fail("findall result", snap.status, snap.json);
  const candidates: FindAllCandidate[] = snap.json.candidates ?? [];
  return {
    findallId: id,
    candidates: candidates.filter((c) => c.match_status === "matched"),
    complete: !run.status.is_active,
    terminationReason: run.status.termination_reason ?? null,
  };
}
