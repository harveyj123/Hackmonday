# Spec: discovery

Module id: `discovery` · Owner: Joey · Status: **draft v2, awaiting approval**

v2 changes: the app is now **pure Electron** (PR #5, no Next.js), and the Parallel details below come from docs.parallel.ai as of Oct 19. Task and FindAll take far too long for a live chat, so the live path is Search plus model extraction, and Task vetting runs in the background.

## Assumptions (correct these before building)

1. **Pure Electron app** (PR #5): a React renderer, with all outside calls in the **Electron main process**. `discovery` runs in the main process and the renderer reaches it over IPC through the shared preload bridge. Paths below use `main/discovery/`, a placeholder for wherever the port puts main-process code; pin it once the port lands.
2. Parallel is the only external data API. There are no Luma, Meetup or LinkedIn APIs and no logged-in scraping.
3. The model is the main-process two-sided client (Cline / OpenAI / custom, with fallback, per PLAN §2), via `BOTS_LLM_PROVIDER`. `discovery` never picks a provider itself.
4. The demo persona is in San Francisco and the window is the next 7 days.
5. The `Opportunity` type lives in `main/discovery/types` until the team agrees to move it into the shared contracts.
6. Keys (`PARALLEL_API_KEY`, model keys) are read only by the main process and never reach the renderer.

## Objective

Give the bot engine a single call that turns a goal into a short, ranked list of real things the user can walk into this week: events, groups, places and people. Each one comes with a link, the source it came from, and how to get in.

**User story:** As Nomi's bot engine, when a user hands off "find more rooms with builders like Priya" (area `career`), I call `discover()`. Within ~5 s I get 3–5 opportunities to render as cards. Over the next minute or two, some cards update in place with vetted details (host, who goes, how to get in).

**Success looks like:** live Luma/Meetup cards appear a few seconds after the hand-off, with citations, and none of them are made up.

## What Parallel gives us (checked Oct 19, docs.parallel.ai)

| API | Call | Speed | Role in Nomi |
|---|---|---|---|
| **Search** | `POST /v1/search`, sync | `fast` mode ≈ 700 ms | **Live path.** Every chat turn. |
| **Task** | `POST /v1/tasks/runs` then `GET /v1/tasks/runs/{run_id}/result?timeout=` | `lite` p50 ≈ 45 s, `base` ≈ 50 s, `core` ≈ 1.5 min, plus queue time | **Background vetting** of the top 3, updating cards after they first render. Never blocks a reply. |
| **FindAll** | `POST /v1beta/findall/runs`, poll `GET /v1beta/findall/runs/{findall_id}`, snapshot `GET …/result` | async, minutes (generator pricing and latency not checked yet) | **Pre-warm only:** run before the demo to fill the cache, and later powers Opportunity Radar. Not in the live path. |

Request details that matter:

- **Search:** `search_queries` (required, 2–3 queries of 3–6 words), `objective`, `mode: "fast"`, `advanced_settings: { source_policy: { include_domains, after_date }, location: "us", max_results }`. Unknown keys are rejected (`additionalProperties: false`). The response is `results[{ url, title, publish_date, excerpts[] }]`, plus `warnings`. The existing `search()` in `lib/parallel.ts` already matches this, so port it as is.
- **Task:** `processor: "lite"` (try `base` if quality is poor), `input` (the event URL plus context), `task_spec.output_schema: { type: "json", json_schema }`. The result is `output.content` (our fields) plus `output.basis[].citations[].url`, which become `Opportunity.citations`. A `408` on `/result` means "still running, call again".
- **FindAll:** `objective`, `entity_type` ("event"), `match_conditions[{ name, description }]`, `generator: "base"`, `match_limit` (minimum 5). Candidates come back with `match_status`; keep `matched` only.

## Interface

```ts
// main/discovery/types
export type OpportunityKind = "event" | "group" | "place" | "person";
export type OpportunitySource = "luma" | "meetup" | "eventbrite" | "partiful" | "linkedin" | "web";
export type JoinMode = "rsvp" | "request" | "ticket" | "join_group" | "dropin" | "contact" | "connect";

export type Opportunity = {
  id: string;               // sha1 of canonical url
  kind: OpportunityKind;
  source: OpportunitySource;
  area: GoalArea;           // "career" | "health" | "hobbies" | "social" (shared contracts)
  title: string;
  url: string;              // canonical
  start?: string;           // ISO with offset; events only
  end?: string;
  location?: string;
  host?: { name: string; url?: string; contactUrl?: string };
  whoGoes?: string;
  vibe?: string;
  joinMode: JoinMode;
  whyMatch: string;         // one sentence tied to the user's goal
  citations: string[];      // >= 1
  vetted: boolean;          // true once a Parallel Task confirmed the fields
};

export type DiscoverRequest = {
  area: GoalArea; goal: string; context?: string;
  city: string; windowDays: number;
  kinds?: OpportunityKind[]; limit?: number;   // limit default 5
};

export type DiscoverResult = {
  requestId: string;
  opportunities: Opportunity[];
  mode: "live" | "cache" | "mock";
  tookMs: number;
  warnings: string[];
};

export type DiscoverEvent =
  | { requestId: string; type: "progress"; step: "search" | "extract" | "rank" | "vet"; label: string; done: boolean }
  | { requestId: string; type: "vetted"; opportunity: Opportunity };   // replaces the card with the same id

// main-process API
export function discover(req: DiscoverRequest, emit?: (e: DiscoverEvent) => void): Promise<DiscoverResult>;
export function vet(o: Opportunity, emit?: (e: DiscoverEvent) => void): Promise<Opportunity>;
export function toInfoCard(o: Opportunity): InfoCard;              // subtitle "Thu 7pm · SoMa · ~30 builders"
export function toCalendarEvent(o: Opportunity): CalendarEvent | null;
```

**IPC (added to the shared preload bridge; ask the port owner first):** `nomi.discovery.discover(req)` returns a `DiscoverResult`, and `nomi.discovery.onEvent(cb)` delivers `progress` and `vetted` events. The bot engine also runs in the main process, so it can call `discover()` directly. IPC is only for any renderer-driven flows.

`progress` maps onto the bot's status line ("searching Luma, Meetup…" → "reading 8 pages…" → "ranked" → "vetting 3 rooms…").

## Pipeline

**Live path (target ≤ 5 s):**
1. **Plan queries.** Pick kinds and domains for the area (table below) and build 2–3 Search queries from `goal`, `context`, `city` and the week.
2. **Search.** One `fast` call per kind, in parallel, with `include_domains`, `after_date` = today and `location: "us"`, `max_results` 8.
3. **Canonicalize and dedupe.** Lowercase the host, rewrite `luma.com` to `lu.ma`, strip `utm_*`, `ref` and trailing slashes, and dedupe on the canonical URL.
4. **Extract.** One `chat({ json: true })` call turns the titles and excerpts into draft `Opportunity` fields (title, start, location, joinMode, source) with `vetted: false`. Only facts present in the excerpts get filled in. Events whose date falls outside the window are dropped.
5. **Rank.** The same or a second model call orders the results and writes `whyMatch` (≤ 20 words). Without a model, keep Search order and use a template `whyMatch`.
6. **Return** the top `limit` and write the cache.

**Background path (does not block the reply):**
7. **Vet.** Start a Parallel Task (`lite`) for the top 3 at the same time as step 6. Poll `/result` with a short `timeout` until done. Merge `output.content` into the opportunity, append the `basis` citations, set `vetted: true`, emit `vetted`, and update the cache. Give up after 4 minutes and leave the card as is.

**Pre-warm (before the demo, and Opportunity Radar later):**
8. `scripts/warm.ts` runs FindAll (`generator: "base"`, `match_limit` 10) plus Task vetting for the demo goals and saves the results to the cache, so a `cache`-mode replay shows fully vetted cards instantly.

| Area | Default kinds | Search domains |
|---|---|---|
| career | event, person, place | events: `lu.ma, meetup.com, eventbrite.com, partiful.com`; people: `linkedin.com, x.com, github.com` (public pages only); places: open web |
| health | place, group, event | open web + `meetup.com` |
| hobbies | group, event, place | `meetup.com, eventbrite.com, lu.ma` + open web |
| social | event, group | `partiful.com, lu.ma, meetup.com` |

### Modes and fallbacks

`NOMI_DISCOVERY_MODE` = `live` (default) | `cache` | `mock`

- No `PARALLEL_API_KEY`: `mock`, which returns the bundled fixtures (start with the two real cards from PLAN §4: *Step 5 Preview Launch Night & AI Founders Meetup*, *Hackers and Founders SF*).
- Search fails: return the cached result for the same request if present, else fixtures, plus a warning. Never throw to the caller except on invalid input.
- `cache` replays the last live or pre-warmed result instantly. This is the "wifi died" key.

## Commands

```bash
npx tsx scripts/discover.ts --area career --goal "become part of the SF AI founder scene" --city "San Francisco" --days 7
npx tsx scripts/discover.ts --area health --goal "climb twice a week" --city "San Francisco" --days 7 --vet
npx tsx scripts/warm.ts                       # FindAll + Task for the demo goals, fills the cache
npx tsx --test tests/discovery/*.test.ts
npm run typecheck                             # whatever the port defines
```

(`tsx` is a new dev dependency, ask first. If the port ships its own TypeScript runner, use that.)

## Project Structure

```
main/discovery/types          Opportunity, request/result/event types
main/discovery/index          discover(), vet()
main/discovery/parallel       search() (ported as is), taskRun(), findAll() — or extend the shared Parallel client if the port keeps one
main/discovery/queries        per-area templates and domain lists
main/discovery/normalize      canonicalUrl, dedupe, window filter, Task output -> Opportunity
main/discovery/extract        model extraction + ranking prompts
main/discovery/cache          read/write cache under the app's userData folder
main/discovery/adapters       toInfoCard, toCalendarEvent
scripts/discover.ts, scripts/warm.ts
fixtures/discovery/           committed mock results (public event pages, team members only)
tests/discovery/              unit tests + recorded Parallel responses
```

## Code Style

Match the repo: double quotes, semicolons, 2-space indent, named exports, a short comment for each *why*, `null` instead of throwing when a key is missing.

```ts
// Luma serves the same event on two hosts and appends tracking params; collapse them so dedupe works.
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^luma\.com$/, "lu.ma");
  for (const key of [...u.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "ref") u.searchParams.delete(key);
  }
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}
```

## Testing Strategy

- **Unit** (`node:test` via `tsx --test`):
  - `canonicalUrl`, dedupe and window filtering
  - mapping a recorded Search response through extraction (model stubbed) into `Opportunity`
  - merging a recorded Task `output` and its `basis` citations
  - `toInfoCard`, `toCalendarEvent`
  - the fixtures validating against the `Opportunity` guard
- **Recordings:** `--record` saves raw Search, Task and FindAll responses to `tests/discovery/recordings/`, so the tests use real shapes with no network.
- **Live smoke (manual, before each checkpoint):** the two `discover` commands above, checked against the success criteria.
- No coverage target. Every function in `normalize` and `adapters` gets a test.

## Boundaries

- **Always:** keep keys in the main process; give every opportunity ≥ 1 citation; keep Task and FindAll off the live reply path; fall back to cache or mock instead of throwing; send only fields the Search API accepts.
- **Ask first:** changes to the shared contracts or the preload bridge; new dependencies; using processors above `base` or FindAll generators above `base` (cost); turning on Monitor.
- **Never:** fetch LinkedIn or any logged-in page from this module; invent facts that aren't in the excerpts or Task output; commit the cache or real third-party people data; commit keys.

## Success Criteria

1. `discover` for `career`, SF, 7 days, `live` mode, returns ≥ 3 opportunities in ≤ 5 s. Each has a canonical URL, a title, ≥ 1 citation, a `joinMode` and a `whyMatch`, and every event start falls within the window.
2. The same call for `health` returns ≥ 2 places or groups.
3. No two results share a canonical URL.
4. With `--vet`, at least 2 of the top 3 emit a `vetted` event within 4 minutes. The merged fields carry Task citations, and the reply wasn't delayed by vetting.
5. With no `PARALLEL_API_KEY`, `discover()` resolves with `mode: "mock"` and fixtures, and doesn't throw.
6. If Search fails mid-call, the call still resolves from cache or fixtures with a warning.
7. After `scripts/warm.ts`, `NOMI_DISCOVERY_MODE=cache` shows vetted cards in < 200 ms.
8. `toInfoCard` and `toCalendarEvent` output plugs straight into `ChatMessage.card` and the `calendar_hold` payload.
9. Typecheck and unit tests pass.

## Open Questions

1. **Where main-process code lives in the port:** `main/discovery/` is a placeholder. Who owns the shared preload bridge?
2. **Parallel client ownership:** `lib/parallel.ts` was listed under the Bots teammate. In the port, does discovery own the Parallel client or extend a shared one?
3. **Task quality vs speed:** is `lite` good enough to vet events, or do we need `base`? Decide with the first live run.
4. **FindAll cost and latency:** not checked yet (the generator pricing page). Pre-warm only until we know.
5. **Category names:** the shared contracts use `hobbies`; this spec keeps it.
6. **City:** still SF? PLAN §4 fallback cards are SF.
