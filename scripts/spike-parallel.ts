// D0 spike: one live Parallel Search (fast) and one Task (lite) to prove the key works,
// measure latency and save raw responses as recordings for the discovery unit tests.
// Run: node scripts/spike-parallel.ts
import { mkdirSync, writeFileSync } from "node:fs";

// Keys live in .env.local (gitignored); a missing file just means mock mode later.
try { process.loadEnvFile(".env.local"); } catch {}

const API = "https://api.parallel.ai";
const KEY = process.env.PARALLEL_API_KEY;
const OUT = "tests/discovery/recordings";

if (!KEY) {
  console.error("PARALLEL_API_KEY is empty in .env.local; nothing to spike.");
  process.exit(1);
}

const headers = { "content-type": "application/json", "x-api-key": KEY };
const today = new Date().toISOString().slice(0, 10);

function save(name: string, data: unknown) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}`, JSON.stringify(data, null, 2) + "\n");
  console.log(`saved ${OUT}/${name}`);
}

// Error bodies are {type, error: {ref_id, message}}; they never echo the key, so they're safe to print.
async function call(method: string, path: string, body?: unknown) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, tookMs: Math.round(performance.now() - started), json, text };
}

// --- Search: the live-path call. after_date and location are the two keys main's search() doesn't send yet.
const searchRequest = {
  objective: "In-person AI founder and builder events in San Francisco in the next 7 days",
  search_queries: ["AI founders meetup San Francisco", "SF AI builders event this week"],
  mode: "fast",
  advanced_settings: {
    source_policy: { include_domains: ["luma.com", "lu.ma", "meetup.com"], after_date: today },
    location: "us",
    max_results: 8,
  },
};

console.log("Search (fast)…");
const search = await call("POST", "/v1/search", searchRequest);
console.log(`status ${search.status} · tookMs ${search.tookMs}`);
if (search.status !== 200) {
  console.error(search.text.slice(0, 500));
  process.exit(1);
}
const results = (search.json as { results: { url: string; title: string | null }[]; warnings?: unknown[] }).results;
for (const r of results) console.log(`  ${r.url}  ${r.title ?? ""}`);
const warnings = (search.json as { warnings?: unknown[] }).warnings;
if (warnings?.length) console.log("warnings:", JSON.stringify(warnings));
save("search-career.json", { request: searchRequest, status: search.status, tookMs: search.tookMs, response: search.json });

// --- Task: background vetting of one event page. Never on the live path (p50 ~45 s).
// Search also returns listing pages (Meetup /find/, Luma calendars); vet a single event page instead.
const isEventPage = (r: { url: string; title: string | null }) =>
  (/^https:\/\/(luma\.com|lu\.ma)\/[^/]+$/.test(r.url) && !/events calendar/i.test(r.title ?? "")) ||
  /meetup\.com\/[^/]+\/events\/\d+/.test(r.url);
const eventUrl = results.find(isEventPage)?.url;
if (!eventUrl) {
  console.error("No Luma or Meetup URL in the results; skipping Task.");
  process.exit(1);
}

const taskRequest = {
  processor: "lite",
  input: `Event page: ${eventUrl}. Context: a San Francisco AI engineer looking for rooms with other builders this week.`,
  task_spec: {
    output_schema: {
      type: "json",
      json_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start date-time in ISO 8601 with UTC offset, or empty if unknown" },
          location: { type: "string", description: "Venue name and neighborhood, or empty if unknown" },
          host_name: { type: "string", description: "Host or organizer name" },
          who_goes: { type: "string", description: "Who usually attends, one short phrase" },
          join_mode: { type: "string", description: "One of: rsvp, request, ticket, join_group, dropin" },
        },
        required: ["title", "start", "location", "host_name", "who_goes", "join_mode"],
        additionalProperties: false,
      },
    },
  },
};

console.log(`\nTask (lite) on ${eventUrl}…`);
const created = await call("POST", "/v1/tasks/runs", taskRequest);
console.log(`create status ${created.status} · tookMs ${created.tookMs}`);
if (created.status !== 200 && created.status !== 202) {
  console.error(created.text.slice(0, 500));
  process.exit(1);
}
const runId = (created.json as { run_id: string }).run_id;

// /result long-polls up to `timeout` seconds and answers 408 while the run is still active.
const taskStarted = performance.now();
let result = await call("GET", `/v1/tasks/runs/${runId}/result?timeout=30`);
while (result.status === 408 && performance.now() - taskStarted < 4 * 60_000) {
  console.log(`  still running… ${Math.round((performance.now() - taskStarted) / 1000)} s`);
  result = await call("GET", `/v1/tasks/runs/${runId}/result?timeout=30`);
}
const taskMs = Math.round(performance.now() - taskStarted);
console.log(`result status ${result.status} · tookMs ${taskMs}`);
if (result.status !== 200) {
  console.error(result.text.slice(0, 500));
  process.exit(1);
}

type TaskOutput = { output: { content: unknown; basis?: { citations?: { url: string }[] }[] } };
const output = (result.json as TaskOutput).output;
console.log("content:", JSON.stringify(output.content, null, 2));
const citations = [...new Set((output.basis ?? []).flatMap((b) => (b.citations ?? []).map((c) => c.url)))];
console.log(`citations (${citations.length}):`);
for (const url of citations) console.log(`  ${url}`);
save("task-event.json", { request: taskRequest, runId, status: result.status, tookMs: taskMs, response: result.json });
