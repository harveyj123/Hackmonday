# Tasks: discovery + browser-actions (Joey)

Plan: `tasks/plan.md` · Specs: `docs/specs/`
Branches: `bots/discovery-*` and `bots/browser-*`, merged to `main` at each checkpoint (see `docs/WORKFLOW.md`).
Estimates are rough. **Cut line:** D0–D5 + D7, then B0–B4. Everything below the cut is a bonus.

## Prerequisites (ask first, before any code)

- [ ] P1 (**pending port**): Confirm the port layout with Harvey: where main-process code and the preload bridge live. Replace the `main/` placeholder in the specs and this file. The port isn't on `main` as of Oct 19; see `tasks/plan.md` §5.
- [x] P2: Dev deps. **`tsx` dropped:** scripts and tests use Node 24 native type stripping. `playwright-core` needs Joey's OK at B0.
- [ ] P3: `PARALLEL_API_KEY` in `.env.local` (file created; Joey pastes the key). Scripts call `process.loadEnvFile(".env.local")` in a `try`. Main entry does the same (**pending port**; `desktop/main.js` on `main` doesn't).
- [ ] P4: Team-owned demo targets exist: a Luma event (request to join, 2 questions) and a contact form that emails a teammate. A demo account is chosen for the Nomi browser.

## Track A: discovery

- [ ] **D0: Parallel spike** (~20 min)
  - Acceptance: one Search (`fast`, `include_domains` luma.com/lu.ma/meetup.com, plus `after_date` and `location: "us"` to confirm the API accepts them) and one Task (`lite`, one event URL, JSON schema) succeed. Latency is printed, and the raw responses are saved. The key is loaded with `process.loadEnvFile` and never printed.
  - Verify: `node scripts/spike-parallel.ts` prints result URLs and `tookMs`. The files exist in `tests/discovery/recordings/`.
  - Files: `scripts/spike-parallel.ts`, `tests/discovery/recordings/search-career.json`, `tests/discovery/recordings/task-event.json`
- [ ] **D1: Types + normalize** (~25 min)
  - Acceptance: the `Opportunity` types, `canonicalUrl`, `dedupe` and `inWindow` exist and match the spec. `lu.ma` rewrites to `luma.com`, and `utm_*` is stripped. Shared types come in via `import type` from `lib/types.ts` (pending port).
  - Verify: `node --test tests/discovery/normalize.test.ts`; `npm run typecheck`
  - Files: `main/discovery/types.ts`, `main/discovery/normalize.ts`, `tests/discovery/normalize.test.ts`, `tsconfig.json` (`allowImportingTsExtensions`, a small separate commit announced to the team)
- [ ] **D2: Parallel client** (~25 min)
  - Acceptance: `search()` from `lib/parallel.ts` plus optional `afterDate` and `location` (it lacks both on `main`; wrap it here or extend it with a heads-up to the Bots teammate, who owns the file). `taskRun()` handles create, then `/result` with `timeout` and a retry on 408. `findAll()` handles create, then polls until `is_active` is false, then fetches the snapshot. All return `null` when no key is set.
  - Verify: unit tests with `fetch` stubbed by the D0 recordings; typecheck.
  - Files: `main/discovery/parallel.ts`, `tests/discovery/parallel.test.ts`
- [ ] **D3: Queries + extract + rank** (~30 min)
  - Acceptance: per-area templates and domain lists from the spec table. Extraction turns Search excerpts into draft opportunities (`vetted: false`) and fills only facts present in the excerpts. Ranking writes `whyMatch` ≤ 20 words. The model function is injected (shape of `chat()` in `lib/llm.ts`; the two-sided client is pending port), with a template fallback when no model is configured.
  - Verify: tests with a stubbed model on the D0 Search recording.
  - Files: `main/discovery/queries.ts`, `main/discovery/extract.ts`, `tests/discovery/extract.test.ts`
- [ ] **D4: Cache + modes + fixtures** (~20 min)
  - Acceptance: `NOMI_DISCOVERY_MODE` live/cache/mock. The cache lives under userData (or `data/cache/` in scripts, gitignored). Fixtures per area exist and pass the `Opportunity` guard.
  - Verify: fixture validation test; `git status --ignored` shows the cache as ignored.
  - Files: `main/discovery/cache.ts`, `fixtures/discovery/career.json`, `fixtures/discovery/health.json`, `tests/discovery/fixtures.test.ts`, `.gitignore`
- [ ] **D5: `discover()` + CLI** (~25 min) → **Checkpoint C2**
  - Acceptance: the live path runs search → dedupe → extract → rank → cache and emits `progress` events. It falls back to cache or fixtures on error and never throws on valid input. Meets spec success criteria 1, 2, 3, 5 and 6.
  - Verify: `node scripts/discover.ts --area career …` (≥ 3 results, ≤ 5 s) and `--area health` (≥ 2 results). Run again without the key and get `mode: "mock"`.
  - Files: `main/discovery/index.ts`, `scripts/discover.ts`
- [ ] **D6: Background `vet()`** (~25 min)
  - Acceptance: Task `lite` runs on the top 3 without delaying the reply. Results merge `output.content` and `basis` citations, set `vetted: true` and emit `vetted`. Gives up after 4 minutes. Spec success criterion 4.
  - Verify: `node scripts/discover.ts --area career … --vet` prints the cards immediately, then the vetted updates.
  - Files: `main/discovery/index.ts`, `main/discovery/normalize.ts`, `tests/discovery/vet.test.ts`
- [ ] **D7: Adapters + hand-off to the Bots teammate** (~20 min) → **Checkpoint C3**
  - Acceptance: `toInfoCard` (`InfoCard` from `lib/types.ts`) and `toCalendarEvent` (`CalendarEvent` from `lib/calendar.ts`) pass tests. The Bots teammate calls `discover()` from the main process (or over IPC) and renders live cards (**pending port**: bot-engine location). Spec success criterion 8.
  - Verify: unit tests; an in-app hand-off shows real cards.
  - Files: `main/discovery/adapters.ts`, `tests/discovery/adapters.test.ts`
- [ ] **D8: Pre-warm** (~20 min, bonus)
  - Acceptance: `scripts/warm.ts` runs FindAll (`base`, `match_limit` 10) and vets the results for the demo goals, writing the cache. Cache-mode replay shows vetted cards in < 200 ms. Spec success criterion 7.
  - Verify: `node scripts/warm.ts`, then `NOMI_DISCOVERY_MODE=cache node scripts/discover.ts …`
  - Files: `scripts/warm.ts`, `main/discovery/index.ts`

## Track B: browser-actions

- [ ] **B0: CDP spike** (~20 min) → **Checkpoint C1** (with D0)
  - Needs first: Joey's OK on `playwright-core`.
  - Acceptance: a standalone Electron script opens a window with partition `persist:nomi-web`. Playwright `connectOverCDP` finds the page by `#nomi-<id>` and fills and screenshots a local fixture form. Decide between CDP and the `webContents` fallback and write the decision in the spec.
  - Verify: `npx electron spikes/cdp-spike.ts` saves `spikes/out.png` showing the filled form. (If Electron 38's Node won't strip types for the entry, bundle the spike with the port's build or decide at B0. `spikes/out.png` is gitignored.)
  - Files: `spikes/cdp-spike.ts`, `main/browser/fixtures/luma-like.html`, `.gitignore`
- [ ] **B1: Nomi browser window + sign-in** (~20 min)
  - Acceptance: a visible "Nomi is browsing" window with a persistent partition, sandboxed and with no preload. `signIn(site)` opens the login page, and the login survives a restart.
  - Verify: manual: sign in to Luma, restart the app, and you're still signed in.
  - Files: `main/browser/window.ts`, `main/browser/cdp.ts`
- [ ] **B2: Job state machine + guards + mock** (~30 min)
  - Acceptance: preparing → review → submitting → done. A second `confirm()` does nothing. One job at a time, one submit per site per minute, domain lock, and step/job timeouts. Pages with a password, payment or CAPTCHA end as `needs_manual`. `NOMI_BROWSER_MODE=mock` emits the full event sequence.
  - Verify: `node --test tests/browser/*.test.ts` on the state machine and guards; spec success criteria 5, 6 and 9 on fixtures.
  - Files: `main/browser/index.ts`, `main/browser/guards.ts`, `main/browser/mock.ts`, `tests/browser/state.test.ts`, `tests/browser/guards.test.ts`
- [ ] **B3: IPC bridge** (~20 min, needs the port and asking first; **pending port**: on `main` the only preload is the pet window's `desktop/preload.js`)
  - Acceptance: `window.nomi.browser` exposes `prepare`, `confirm`, `cancel`, `signIn` and `onEvent`. It's absent when the bridge doesn't load. Spec success criterion 8.
  - Verify: in the app's devtools, run `await window.nomi.browser.prepare(mockJob)` in mock mode and watch the events stream.
  - Files: the shared preload bridge, the port's main entry (CDP switch and handler registration)
- [ ] **B4: Luma recipe** (~45 min) → **Checkpoint C4**
  - Acceptance: detects already-registered and signed-out states, clicks Register or Request to join, fills name, email and the custom questions (canned answers until B5), stops at review with a screenshot, and `submit` reads the confirmation. Spec success criteria 1–4.
  - Verify: `npm run browser:try -- --url file://…/luma-like.html` first, then on the team Luma event: signed out → `needs_login`; signed in → review → Submit → pending in the host view; run again → `already_registered`.
  - Files: `main/browser/recipes/luma.ts`, `main/browser/try.ts`, `main/browser/fixtures/luma-like.html`, `profile.example.json`, `.gitignore` (`profile.local.json`)
- [ ] **B5: Model-written answers** (~15 min)
  - Acceptance: custom questions get ≤ 2-sentence answers, true to the profile, from the main-process model client. Canned answers are used without a key. The answers appear in the review card's fields.
  - Verify: a unit test with a stubbed model; a live run on the team event.
  - Files: `main/browser/answers.ts`, `tests/browser/answers.test.ts`
- [ ] **B6: Contact-form recipe** (~25 min)
  - Acceptance: finds a name + email + message form, fills it with `job.message` and stops at review. Submitting delivers to the teammate's inbox. Spec success criterion 7.
  - Verify: fixture first, then the team's test form.
  - Files: `main/browser/recipes/contact-form.ts`, `main/browser/fixtures/contact.html`
- [ ] **B7: Chat integration with the Bots teammate** (~25 min, needs asking first; **pending port**) → **Checkpoint C5**
  - Acceptance: `"browser_action"` is added to `PendingAction.kind` in the shared contracts (`lib/types.ts` on `main`). Approve calls `prepare()`, the review card's Submit calls `confirm()`, and milestones follow the `step` events. With no bridge, the card shows "Open event page".
  - Verify: the full path in the app: Sprout → storyboard → hand-off → live cards → Get me in → review → Submit → Luma shows pending. Record the backup video.
  - Files: shared contracts (one small commit), the Bots chat card (teammate's file, paired)
- [ ] **B8: Meetup + LinkedIn assist** (bonus)
  - Acceptance: Meetup can join a group and attend. LinkedIn assist opens the profile and shows the drafted note with a Copy button, never clicks Connect, and always returns `needs_manual`.
  - Verify: fixtures; Meetup live on a team-owned group if one exists.
  - Files: `main/browser/recipes/meetup.ts`, `main/browser/recipes/linkedin-assist.ts`

## Final verification

- [ ] Every success criterion in both specs is checked off or marked as cut
- [ ] Typecheck and all unit tests pass
- [ ] `git status --ignored` lists `.env.local`, the cache and `profile.local.json` as ignored
- [ ] Backup video recorded; `NOMI_DISCOVERY_MODE=cache` and `NOMI_BROWSER_MODE=mock` rehearsed
