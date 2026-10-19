import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { findAll, search, taskRun } from "../../main/discovery/parallel.ts";
import searchRec from "./recordings/search-career.json" with { type: "json" };
import taskRec from "./recordings/task-event.json" with { type: "json" };

type Call = { url: string; method: string; headers: Record<string, string>; body: any };

// Replays canned responses in order and records every request, so tests never touch the network.
function stubFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

const savedKey = process.env.PARALLEL_API_KEY;
beforeEach(() => { process.env.PARALLEL_API_KEY = "test-key"; });
afterEach(() => {
  mock.restoreAll();
  if (savedKey === undefined) delete process.env.PARALLEL_API_KEY;
  else process.env.PARALLEL_API_KEY = savedKey;
});

test("search returns null without a key and makes no request", async () => {
  delete process.env.PARALLEL_API_KEY;
  const calls = stubFetch([]);
  assert.equal(await search({ objective: "x", queries: ["a b c"] }), null);
  assert.equal(calls.length, 0);
});

test("search sends only accepted fields, nested under advanced_settings", async () => {
  const calls = stubFetch([{ status: 200, body: searchRec.response }]);
  const results = await search({
    objective: "AI events in SF",
    queries: ["AI founders meetup San Francisco"],
    includeDomains: ["luma.com", "meetup.com"],
    afterDate: "2026-10-19",
    location: "us",
    maxResults: 8,
  });
  assert.equal(results?.length, searchRec.response.results.length);
  assert.equal(results?.[0].url, searchRec.response.results[0].url);
  const [call] = calls;
  assert.equal(call.url, "https://api.parallel.ai/v1/search");
  assert.equal(call.method, "POST");
  assert.equal(call.headers["x-api-key"], "test-key");
  assert.deepEqual(call.body, {
    objective: "AI events in SF",
    search_queries: ["AI founders meetup San Francisco"],
    mode: "fast",
    advanced_settings: {
      source_policy: { include_domains: ["luma.com", "meetup.com"], after_date: "2026-10-19" },
      location: "us",
      max_results: 8,
    },
  });
});

test("search omits source_policy and location when not given", async () => {
  const calls = stubFetch([{ status: 200, body: { search_id: "s", session_id: "t", results: [] } }]);
  await search({ objective: "x", queries: ["a b c"] });
  assert.deepEqual(calls[0].body.advanced_settings, { max_results: 5 });
});

test("search throws with the status on an API error", async () => {
  stubFetch([{ status: 422, body: { type: "error", error: { ref_id: "r", message: "bad field" } } }]);
  await assert.rejects(search({ objective: "x", queries: ["a b c"] }), /422/);
});

const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false };

test("taskRun returns null without a key and makes no request", async () => {
  delete process.env.PARALLEL_API_KEY;
  const calls = stubFetch([]);
  assert.equal(await taskRun({ input: "x", jsonSchema: schema }), null);
  assert.equal(calls.length, 0);
});

test("taskRun creates a lite run, retries /result on 408, and returns content and basis", async () => {
  const calls = stubFetch([
    { status: 202, body: { run_id: "run_1", status: "queued", is_active: true } },
    { status: 408, body: { type: "error", error: { ref_id: "r", message: "still active" } } },
    { status: 408, body: { type: "error", error: { ref_id: "r", message: "still active" } } },
    { status: 200, body: taskRec.response },
  ]);
  const out = await taskRun({ input: "Event page: https://luma.com/x", jsonSchema: schema }, { timeoutS: 5 });
  assert.equal(out?.runId, "run_1");
  assert.deepEqual(out?.content, taskRec.response.output.content);
  assert.deepEqual(out?.basis, taskRec.response.output.basis);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, "https://api.parallel.ai/v1/tasks/runs");
  assert.deepEqual(calls[0].body, {
    processor: "lite",
    input: "Event page: https://luma.com/x",
    task_spec: { output_schema: { type: "json", json_schema: schema } },
  });
  for (const c of calls.slice(1)) assert.equal(c.url, "https://api.parallel.ai/v1/tasks/runs/run_1/result?timeout=5");
});

test("taskRun gives up with null once the deadline passes", async () => {
  const calls = stubFetch([
    { status: 202, body: { run_id: "run_2", status: "queued", is_active: true } },
    { status: 408, body: { type: "error", error: { ref_id: "r", message: "still active" } } },
  ]);
  assert.equal(await taskRun({ input: "x", jsonSchema: schema }, { deadlineMs: 0 }), null);
  assert.equal(calls.length, 2);
});

test("taskRun throws when the run fails", async () => {
  stubFetch([
    { status: 202, body: { run_id: "run_3", status: "queued", is_active: true } },
    { status: 404, body: { type: "error", error: { ref_id: "r", message: "Run failed" } } },
  ]);
  await assert.rejects(taskRun({ input: "x", jsonSchema: schema }), /404/);
});

// FindAll shapes are hand-written from docs.parallel.ai (Oct 19); no live recording until warm.ts (D8).
const run = (status: string, isActive: boolean) => ({
  findall_id: "findall_1",
  status: { status, is_active: isActive, metrics: { generated_candidates_count: 3, matched_candidates_count: 2 }, termination_reason: isActive ? null : "match_limit_met" },
  generator: "base",
});
const candidate = (id: string, matchStatus: string) => ({
  candidate_id: id,
  name: `Event ${id}`,
  url: `https://luma.com/${id}`,
  description: null,
  match_status: matchStatus,
  output: { in_sf: { value: "yes", type: "match_condition", is_matched: true } },
  basis: [{ field: "in_sf", citations: [{ title: "t", url: `https://luma.com/${id}`, excerpts: [] }], reasoning: "r", confidence: "high" }],
});
const findAllReq = {
  objective: "AI builder events in San Francisco next week",
  entityType: "event",
  matchConditions: [{ name: "in_sf", description: "Takes place in San Francisco" }],
};

test("findAll returns null without a key and makes no request", async () => {
  delete process.env.PARALLEL_API_KEY;
  const calls = stubFetch([]);
  assert.equal(await findAll(findAllReq), null);
  assert.equal(calls.length, 0);
});

test("findAll creates a base run, polls until inactive, and keeps only matched candidates", async () => {
  const calls = stubFetch([
    { status: 200, body: run("queued", true) },
    { status: 200, body: run("running", true) },
    { status: 200, body: run("completed", false) },
    { status: 200, body: { run: run("completed", false), candidates: [candidate("a", "matched"), candidate("b", "unmatched"), candidate("c", "matched"), candidate("d", "generated")], last_event_id: null } },
  ]);
  const out = await findAll(findAllReq, { pollMs: 0 });
  assert.deepEqual(out?.candidates.map((c) => c.candidate_id), ["a", "c"]);
  assert.equal(out?.complete, true);
  assert.equal(out?.terminationReason, "match_limit_met");
  assert.equal(calls[0].url, "https://api.parallel.ai/v1beta/findall/runs");
  assert.deepEqual(calls[0].body, {
    objective: findAllReq.objective,
    entity_type: "event",
    match_conditions: findAllReq.matchConditions,
    generator: "base",
    match_limit: 10,
  });
  assert.equal(calls[1].url, "https://api.parallel.ai/v1beta/findall/runs/findall_1");
  assert.equal(calls[3].url, "https://api.parallel.ai/v1beta/findall/runs/findall_1/result");
});

test("findAll returns the partial snapshot when the deadline passes", async () => {
  const calls = stubFetch([
    { status: 200, body: run("queued", true) },
    { status: 200, body: { run: run("running", true), candidates: [candidate("a", "matched")], last_event_id: null } },
  ]);
  const out = await findAll(findAllReq, { pollMs: 0, deadlineMs: 0 });
  assert.equal(out?.complete, false);
  assert.deepEqual(out?.candidates.map((c) => c.candidate_id), ["a"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://api.parallel.ai/v1beta/findall/runs/findall_1/result");
});

test("findAll rejects a match_limit below the API minimum of 5", async () => {
  stubFetch([]);
  await assert.rejects(findAll({ ...findAllReq, matchLimit: 3 }), /match_limit/);
});
