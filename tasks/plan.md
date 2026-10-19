# Implementation plan: discovery + browser-actions (Joey)

Specs: `docs/specs/CAPABILITY-MAP.md`, `docs/specs/SPEC-discovery.md`, `docs/specs/SPEC-browser-actions.md`.
Task list: `tasks/todo.md`.

## 0. Before any code

- **Port layout.** Harvey is porting the app to pure Electron + React (PR #5). The specs use `main/discovery/` and `main/browser/` as placeholder paths. First step: check where main-process code and the preload bridge live, then replace the placeholder in the specs and this plan. If the port isn't merged yet, build discovery as plain TypeScript in `main/discovery/` (no Electron imports), so it moves without changes.
- **Keys.** `PARALLEL_API_KEY` goes in `.env.local` at the repo root (gitignored). The Electron main entry must call `process.loadEnvFile(".env.local")` inside a `try`. Ask Harvey if it isn't there yet.

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

## 5. Verification at the end

- All success criteria in both specs checked off (or explicitly marked as cut)
- `npm run typecheck` and all unit tests pass
- `.env.local`, cache and `profile.local.json` not tracked: `git status --ignored` shows them as ignored
- Backup video of the happy path recorded
