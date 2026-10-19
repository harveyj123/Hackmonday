# Implementation plan: discovery + browser-actions (Joey)

Specs: `docs/specs/CAPABILITY-MAP.md`, `docs/specs/SPEC-discovery.md`, `docs/specs/SPEC-browser-actions.md`.
Task list: `tasks/todo.md`.

## 0. Before any code

- **Port layout (pending port, checked Oct 19).** The Electron + React port isn't on `main`. PR #5 (`docs/plan-update`) only changes `docs/PLAN.md`. `main` is still Next.js (`app/api/*`) plus a CommonJS Electron shell in `desktop/`. The `main/discovery/` and `main/browser/` placeholders stay until the port lands. Meanwhile discovery is plain TypeScript with no Electron or Next imports, so it moves without changes. Every port-dependent item is marked **pending port** and listed in §5.
- **Keys.** `PARALLEL_API_KEY` goes in `.env.local` at the repo root (gitignored, already created from `env.local.example`). Scripts call `try { process.loadEnvFile(".env.local") } catch {}` first. The Electron main entry needs the same call; on `main`, `desktop/main.js` doesn't have it (pending port, ask Harvey). Keys live in the main process only, never in the renderer or a preload.
- **Runtime.** TypeScript everywhere, with no `tsx`. Scripts and tests run on Node 24's native type stripping: `node scripts/x.ts` and `node --test tests/**/*.test.ts`. That means `.ts` extensions on relative imports (`tsconfig.json` gets `allowImportingTsExtensions`, which works because it already has `noEmit`), `import type` for types, no enums, and no `@/` alias in code that Node runs. The port builds Electron's main process separately. `playwright-core` needs Joey's OK at B0.

## 1. Components and dependencies

```
discovery/types ──> normalize ──┐
parallel client ────────────────┼──> discover() ──> vet() ──> adapters ──> bot engine (teammate)
queries + extract/rank ─────────┘         │
cache + fixtures (modes) ─────────────────┘

browser/window + cdp (spike) ──> job state machine + guards + mock ──> IPC/preload ──> recipes (luma, contact-form, meetup)
                                                                        ▲
                         discovery/types (Opportunity) ─────────────────┘
                         model client (answers) ────────────────────────┘
```

## 2. Order and parallel tracks

- **Track A (discovery):** D0 → D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8
- **Track B (browser):** B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8
- B0–B2 can run alongside track A because they don't need `Opportunity` yet. B4 needs D1 (types). B5 needs the model client.
- If time is short, ship **D0–D5 + D7** (live cards in chat) first, then **B0–B4** (Luma RSVP). Everything else is a bonus.

## 3. Checkpoints

| # | After | What must be true | How to check |
|---|---|---|---|
| C1 | D0 + B0 | Parallel key works and returns real Luma/Meetup URLs. Playwright can drive the Electron window, or the fallback has been chosen | spike scripts print results; screenshot saved |
| C2 | D5 | `scripts/discover.ts` gives ≥ 3 career and ≥ 2 health opportunities in ≤ 5 s; mock and cache modes work | CLI runs + unit tests |
| C3 | D7 | Bots teammate renders live cards from `toInfoCard()`; calendar hold uses `toCalendarEvent()` | in-app demo of hand-off to cards |
| C4 | B4 | Luma request-to-join on the team event: review card, then Submit, then pending in Luma's host view | manual E2E checklist |
| C5 | D8 + B7 | Pre-warmed cache replay works; full path from Sprout to cards to Get me in to Submit | backup video recorded |

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Parallel Task is slow (`lite` p50 ≈ 45 s) | Keep Task off the live path. Background `vet()` updates cards later; `warm.ts` pre-fills the cache before the demo |
| FindAll latency or cost unknown | Pre-warm only, `generator: "base"`, `match_limit` 10 |
| `connectOverCDP` can't drive the Electron window | B0 decides within 20 min. Fallback is `webContents.executeJavaScript` + `debugger` behind the same recipe interface |
| Luma changes its markup | Role/label selectors; fixture pages; the demo uses the team's own event; a recorded backup video |
| Port not merged when browser work starts | B0–B2 as standalone Electron scripts; wire IPC (B3) after the port lands |
| Shared-file conflicts (types, preload, main entry) | Small separate commits, announced first, merged to `main` before dependent work (WORKFLOW rules) |
| Wifi at the venue | `NOMI_DISCOVERY_MODE=cache` and `NOMI_BROWSER_MODE=mock` one keypress away |

## 5. Spec conflicts, pending port

Checked against `main` at `102888f` and `docs/PLAN.md` on `docs/plan-update` (PR #5). Listed here and not rewritten until the port lands.

| # | Spec says | `main` today | Affects |
|---|---|---|---|
| 1 | The bot engine is `app/api/agent` and calls `discover()` in the main process (CAPABILITY-MAP) | `app/api/agent/route.ts` is a Next.js route. PLAN says the teammate rebuilds it as a main-process handler in the port | D5, D7, C3 |
| 2 | `nomi.discovery.*` and `nomi.browser.*` go on "the shared preload bridge" | The only preload is `desktop/preload.js`. It loads only in the Sprout pet window and exposes `window.nomi.openDaily`. The main window has no preload | B3, B7 |
| 3 | The main entry registers the CDP switch, the IPC handlers and `process.loadEnvFile` | The entry is `desktop/main.js` (CommonJS JS, spawns `next dev`), with no `loadEnvFile` | P3, B0, B1, B3 |
| 4 | The shared contracts (`GoalArea`, `InfoCard`, `PendingAction`) are in `lib/types.ts` | True on `main`. The port may move them. `CalendarEvent` is in `lib/calendar.ts`, not `lib/types.ts` | D1, D7, B7 |
| 5 | The model is the two-sided client via `BOTS_LLM_PROVIDER` (PLAN §2) | `lib/llm.ts` is single-sided (`LLM_BASE_URL/LLM_API_KEY/LLM_MODEL`). `chat(messages, { json })` exists | D3, B5 |
| 6 | "`search()` in `lib/parallel.ts` already matches, port as is" | It doesn't send `after_date` or `location`, and `max_results` defaults to 5. The file belongs to the Bots teammate (WORKFLOW) | D0, D2 (extend with a heads-up, or wrap in `main/discovery/parallel`) |
| 7 | `npm run desktop`, `npm run typecheck`, `browser:try`, `browser:signin` | `desktop` is `electron desktop/main.js` and `typecheck` is `tsc --noEmit`. The `browser:*` scripts don't exist yet | B3, B4 |
| 8 | PLAN §1: "No public API registers you… Nomi holds the slot in Calendar" | Unchanged on PR #5 | Pitch; update after C4 passes (browser spec, open question 6) |

Already resolved in the specs (Oct 19 decisions): keys stay out of the renderer and preload; TypeScript everywhere with tests in `tests/discovery` and `tests/browser`; `try.ts`; no `tsx`; `luma.com` is the canonical Luma host.

Note: the remote has a branch `electron/pure` ("Rebuild Nomi as a pure Electron app without Next.js") with `electron/main.ts`, `electron/preload.ts` and `electron/api/*`, built by esbuild. It isn't merged or announced, so the placeholders stay until Harvey confirms the layout.

## 6. Verification at the end

- All success criteria in both specs checked off (or explicitly marked as cut)
- `npm run typecheck` and all unit tests pass
- `.env.local`, cache and `profile.local.json` not tracked: `git status --ignored` shows them as ignored
- Backup video of the happy path recorded
