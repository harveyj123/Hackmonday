# Tasks: discovery + browser-actions (Joey)

Plan: `tasks/plan.md` · Specs: `docs/specs/`
Branches: `bots/discovery-*` and `bots/browser-*`, merged to `main` at each checkpoint (see `docs/WORKFLOW.md`).
Estimates are rough. **Cut line:** D0–D5 + D7, then B0–B4. Everything below the cut is a bonus.

## Prerequisites (ask first, before any code)

- [ ] P1: Confirm the port layout with Harvey: where main-process code and the preload bridge live. Replace the `main/` placeholder in the specs and this file.
- [ ] P2: Agree on new dev deps: `tsx` (scripts and tests) and `playwright-core` (browser).
- [ ] P3: Main entry calls `process.loadEnvFile(".env.local")` inside a `try`. `PARALLEL_API_KEY` is in `.env.local`.
- [ ] P4: Team-owned demo targets exist: a Luma event (request to join, 2 questions) and a contact form that emails a teammate. A demo account is chosen for the Nomi browser.

## Track A: discovery

- [ ] **D0: Parallel spike** (~20 min)
  - Acceptance: one Search (`fast`, `include_domains` lu.ma/meetup.com) and one Task (`lite`, one event URL, JSON schema) succeed. Latency is printed, and the raw responses are saved.
  - Verify: `npx tsx scripts/spike-parallel.ts` prints result URLs and `tookMs`. The files exist in `tests/discovery/recordings/`.
  - Files: `scripts/spike-parallel.ts`, `tests/discovery/recordings/search-career.json`, `tests/discovery/recordings/task-event.json`
- [ ] **D1: Types + normalize** (~25 min)
  - Acceptance: the `Opportunity` types, `canonicalUrl`, `dedupe` and `inWindow` exist and match the spec. `lu.ma`/`luma.com` and `utm_*` collapse.
  - Verify: `npx tsx --test tests/discovery/normalize.test.ts`
  - Files: `main/discovery/types.ts`, `main/discovery/normalize.ts`, `tests/discovery/normalize.test.ts`
- [ ] **D2: Parallel client** (~25 min)
  - Acceptance: `search()` is ported unchanged. `taskRun()` handles create, then `/result` with `timeout` and a retry on 408. `findAll()` handles create, then polls until `is_active` is false, then fetches the snapshot. All return `null` when no key is set.
  - Verify: unit tests with `fetch` stubbed by the D0 recordings; typecheck.
  - Files: `main/discovery/parallel.ts`, `tests/discovery/parallel.test.ts`
- [ ] **D3: Queries + extract + rank** (~30 min)
  - Acceptance: per-area templates and domain lists from the spec table. Extraction turns Search excerpts into draft opportunities (`vetted: false`) and fills only facts present in the excerpts. Ranking writes `whyMatch` ≤ 20 words. The model function is injected, with a template fallback when no model is configured.
  - Verify: tests with a stubbed model on the D0 Search recording.
  - Files: `main/discovery/queries.ts`, `main/discovery/extract.ts`, `tests/discovery/extract.test.ts`
- [ ] **D4: Cache + modes + fixtures** (~20 min)
  - Acceptance: `NOMI_DISCOVERY_MODE` live/cache/mock. The cache lives under userData (or `data/cache/` in scripts, gitignored). Fixtures per area exist and pass the `Opportunity` guard.
  - Verify: fixture validation test; `git status --ignored` shows the cache as ignored.
  - Files: `main/discovery/cache.ts`, `fixtures/discovery/career.json`, `fixtures/discovery/health.json`, `tests/discovery/fixtures.test.ts`, `.gitignore`
- [ ] **D5: `discover()` + CLI** (~25 min) → **Checkpoint C2**
  - Acceptance: the live path runs search → dedupe → extract → rank → cache and emits `progress` events. It falls back to cache or fixtures on error and never throws on valid input. Meets spec success criteria 1, 2, 3, 5 and 6.
  - Verify: `npx tsx scripts/discover.ts --area career …` (≥ 3 results, ≤ 5 s) and `--area health` (≥ 2 results). Run again without the key and get `mode: "mock"`.
  - Files: `main/discovery/index.ts`, `scripts/discover.ts`
- [ ] **D6: Background `vet()`** (~25 min)
  - Acceptance: Task `lite` runs on the top 3 without delaying the reply. Results merge `output.content` and `basis` citations, set `vetted: true` and emit `vetted`. Gives up after 4 minutes. Spec success criterion 4.
  - Verify: `npx tsx scripts/discover.ts --area career … --vet` prints the cards immediately, then the vetted updates.
  - Files: `main/discovery/index.ts`, `main/discovery/normalize.ts`, `tests/discovery/vet.test.ts`
- [ ] **D7: Adapters + hand-off to the Bots teammate** (~20 min) → **Checkpoint C3**
  - Acceptance: `toInfoCard` and `toCalendarEvent` pass tests. The Bots teammate calls `discover()` from the main process (or over IPC) and renders live cards. Spec success criterion 8.
  - Verify: unit tests; an in-app hand-off shows real cards.
  - Files: `main/discovery/adapters.ts`, `tests/discovery/adapters.test.ts`
- [ ] **D8: Pre-warm** (~20 min, bonus)
  - Acceptance: `scripts/warm.ts` runs FindAll (`base`, `match_limit` 10) and vets the results for the demo goals, writing the cache. Cache-mode replay shows vetted cards in < 200 ms. Spec success criterion 7.
  - Verify: `npx tsx scripts/warm.ts`, then `NOMI_DISCOVERY_MODE=cache npx tsx scripts/discover.ts …`
  - Files: `scripts/warm.ts`, `main/discovery/index.ts`

## Track B: browser-actions

- [ ] **B0: CDP spike** (~20 min) → **Checkpoint C1** (with D0)
  - Acceptance: a standalone Electron script opens a window with partition `persist:nomi-web`. Playwright `connectOverCDP` finds the page by `#nomi-<id>` and fills and screenshots a local fixture form. Decide between CDP and the `webContents` fallback and write the decision in the spec.
  - Verify: `npx electron spikes/cdp-spike.js` saves `spikes/out.png` showing the filled form.
  - Files: `spikes/cdp-spike.js`, `main/browser/fixtures/luma-like.html`
- [ ] **B1: Nomi browser window + sign-in** (~20 min)
  - Acceptance: a visible "Nomi is browsing" window with a persistent partition, sandboxed and with no preload. `signIn(site)` opens the login page, and the login survives a restart.
  - Verify: manual: sign in to Luma, restart the app, and you're still signed in.
  - Files: `main/browser/window.ts`, `main/browser/cdp.ts`
- [ ] **B2: Job state machine + guards + mock** (~30 min)
  - Acceptance: preparing → review → submitting → done. A second `confirm()` does nothing. One job at a time, one submit per site per minute, domain lock, and step/job timeouts. Pages with a password, payment or CAPTCHA end as `needs_manual`. `NOMI_BROWSER_MODE=mock` emits the full event sequence.
  - Verify: `node --test` on the state machine and guards; spec success criteria 5, 6 and 9 on fixtures.
  - Files: `main/browser/index.ts`, `main/browser/guards.ts`, `main/browser/mock.ts`, `tests/browser/state.test.ts`
- [ ] **B3: IPC bridge** (~20 min, needs the port and asking first)
  - Acceptance: `window.nomi.browser` exposes `prepare`, `confirm`, `cancel`, `signIn` and `onEvent`. It's absent when the bridge doesn't load. Spec success criterion 8.
  - Verify: in the app's devtools, run `await window.nomi.browser.prepare(mockJob)` in mock mode and watch the events stream.
  - Files: the shared preload bridge, the port's main entry (CDP switch and handler registration)
- [ ] **B4: Luma recipe** (~45 min) → **Checkpoint C4**
  - Acceptance: detects already-registered and signed-out states, clicks Register or Request to join, fills name, email and the custom questions (canned answers until B5), stops at review with a screenshot, and `submit` reads the confirmation. Spec success criteria 1–4.
  - Verify: `npm run browser:try -- --url file://…/luma-like.html` first, then on the team Luma event: signed out → `needs_login`; signed in → review → Submit → pending in the host view; run again → `already_registered`.
  - Files: `main/browser/recipes/luma.ts`, `main/browser/try.ts`, `main/browser/fixtures/luma-like.html`, `profile.example.json`
- [ ] **B5: Model-written answers** (~15 min)
  - Acceptance: custom questions get ≤ 2-sentence answers, true to the profile, from the main-process model client. Canned answers are used without a key. The answers appear in the review card's fields.
  - Verify: a unit test with a stubbed model; a live run on the team event.
  - Files: `main/browser/answers.ts`, `tests/browser/answers.test.ts`
- [ ] **B6: Contact-form recipe** (~25 min)
  - Acceptance: finds a name + email + message form, fills it with `job.message` and stops at review. Submitting delivers to the teammate's inbox. Spec success criterion 7.
  - Verify: fixture first, then the team's test form.
  - Files: `main/browser/recipes/contact-form.ts`, `main/browser/fixtures/contact.html`
- [ ] **B7: Chat integration with the Bots teammate** (~25 min, needs asking first) → **Checkpoint C5**
  - Acceptance: `"browser_action"` is added to `PendingAction.kind` in the shared contracts. Approve calls `prepare()`, the review card's Submit calls `confirm()`, and milestones follow the `step` events. With no bridge, the card shows "Open event page".
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
