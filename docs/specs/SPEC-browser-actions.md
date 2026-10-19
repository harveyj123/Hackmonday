# Spec: browser-actions

Module id: `browser-actions` · Owner: Joey · Depends on: `discovery` · Status: **draft v2, awaiting approval**

v2 changes: the app is now **pure Electron** (PR #5, no Next.js). Form answers come from a direct call to the main-process model client instead of an HTTP route, and paths move from `desktop/` to the port's main-process folder.

## Assumptions (correct these before building)

1. **Pure Electron app** (PR #5). This module runs in the **Electron main process** next to the model client and `discovery`. Paths use `main/browser/`, a placeholder until the port lands (**pending port**; on `main` the Electron shell is CommonJS JS in `desktop/`). When the bridge is missing (for example in a renderer-only preview), the UI falls back to "Open event page".
2. Nomi drives its **own visible window** ("Nomi is browsing"), not the user's Chrome. Logins persist in an Electron session partition (`persist:nomi-web`), and the user signs in once per site by hand.
3. Playwright (`playwright-core`, so no browser download) attaches to Electron's Chromium over CDP through a localhost-only remote-debugging port. This needs to be proven in a 20-minute spike (task 1). The fallback is the same recipe interface driven by `webContents.executeJavaScript` plus `webContents.debugger`.
4. Recipes are **scripted per site** for the demo paths. A model-guided generic recipe is a stretch goal.
5. Form answers come from the main-process model client (`BOTS_LLM_PROVIDER` side, with fallback), as a direct function call. Keys stay in the main process and never reach the renderer or the Nomi browser window.
6. Every outbound step (the final submit) happens only after an explicit **Submit** tap on a review card showing a screenshot of the filled form.
7. The demo submits to **team-owned targets**: a Luma event the team creates (request-to-join with 2 questions) and a contact form that delivers to a teammate.

## Objective

Turn "this event looks right for you" into "you're on the list", in front of the user, with the user in control.

**User story:** As Harvey, when Nomi Career shows me "AI Founders Night", I tap **Get me in**. A Nomi browser window opens on the event page and I watch it fill in my name, email and two short answers written for this event. A review card in the chat shows a screenshot of the filled form. I tap **Submit**, and Nomi tells me "you're in (pending host approval)". The milestone bar finishes.

**Success looks like:** the demo shows a real registration on a real Luma page, the judges see every step, and nothing gets sent without the user's tap.

## Tech Stack

- Electron 38 main process, written in **TypeScript** (the port builds it into Electron's main bundle; pending port). Unit tests and the `try.ts` runner run on Node 24 native type stripping, with no `tsx`.
- `playwright-core` `chromium.connectOverCDP("http://127.0.0.1:<NOMI_CDP_PORT>")` (new dependency, OK needed at B0)
- IPC through the port's shared preload bridge, adding a `window.nomi.browser` namespace
- The `discovery` `Opportunity` type from `main/discovery/types`

## Interface

### Renderer API (what `features/bots` calls)

```ts
// exposed by the shared preload bridge; absent if the bridge isn't loaded
window.nomi?.browser: {
  available: true;
  prepare(job: ActJob): Promise<{ jobId: string }>;   // opens window, fills, stops at review
  confirm(jobId: string): Promise<void>;              // the only path that clicks submit
  cancel(jobId: string): Promise<void>;
  signIn(site: "luma" | "meetup" | "partiful" | "eventbrite" | "linkedin"): Promise<void>; // opens login page
  onEvent(cb: (e: ActEvent) => void): () => void;     // returns unsubscribe
}

type ActKind = "rsvp" | "request" | "join_group" | "contact" | "connect_assist";

type ActJob = {
  opportunity: Opportunity;      // from discovery
  action: ActKind;
  message?: string;              // contact/connect note drafted by the bot engine
};

type StepId = "open" | "check_login" | "fill" | "review" | "submit" | "confirm";

type ActEvent =
  | { jobId: string; type: "step"; step: StepId; status: "active" | "done" | "failed"; label: string }
  | { jobId: string; type: "review"; screenshot: string /* data:image/png */; fields: { label: string; value: string }[]; submitLabel: string }
  | { jobId: string; type: "done"; outcome: Outcome; detail?: string; url: string }
  | { jobId: string; type: "error"; message: string };

type Outcome = "submitted" | "pending_approval" | "already_registered" | "needs_login" | "needs_manual" | "cancelled";
```

The `step` events map one-to-one onto `BotTask.milestones` (Open → Sign-in → Fill → Review → Submit → Confirmed).

### Integration with the bot engine (shared-contract change, ask first; pending port)

- Add `"browser_action"` to `PendingAction.kind` in `lib/types.ts` (where it is on `main`; the port may move the shared contracts). Its `payload` is an `ActJob`.
- Chat UI: **Approve** on a `browser_action` calls `prepare()`. The `review` event renders as a card with the screenshot and a **Submit** button that calls `confirm()`. If `window.nomi?.browser` is missing, the card shows the event link ("Open event page") instead.

### Recipe interface (main process)

```ts
// main/browser/recipes/types.ts
import type { Page } from "playwright-core";

export type Recipe = {
  id: string;
  matches(url: URL): boolean;
  kinds: ActKind[];
  prepare(page: Page, job: ActJob, ctx: RecipeContext): Promise<ReviewPayload>; // never clicks the final submit
  submit(page: Page, job: ActJob, ctx: RecipeContext): Promise<{ outcome: Outcome; detail?: string }>;
};
```

(If B0 picks the `webContents` fallback, `Page` becomes a small adapter type with the same methods the recipes use.)

`ctx` provides `emit(step)`, `profile` (from `profile.local.json` in the app's userData folder), `answer(questions[])` (a direct call to the main-process model client), and `guard` (see Safety).

| Priority | Recipe | Behavior |
|---|---|---|
| P0 | `luma` | On the event page: detect already registered, detect signed out (→ `needs_login`), click Register / Request to join, fill name/email and the custom questions via `answer()`, stop at the final button. `submit` clicks it and reads the confirmation text (`pending_approval` vs `submitted`). |
| P1 | `contact-form` | On any venue page: find a form with name + email + message fields (labels, `name`/`type` attributes), fill it with `job.message`, stop at submit. |
| P1 | `meetup` | Join group (if needed), then Attend. |
| P2 | `linkedin-assist` | Open the public profile and show the drafted note in the review card with a Copy button. **Never clicks Connect or Send**; the user does that by hand. Outcome is always `needs_manual`. |
| P2 | `eventbrite` | Free-ticket checkout only. Stop if any price > 0. |
| P3 | `generic-llm` | Give the model an accessibility snapshot and let it pick the next fill/click for at most 8 steps. It can never call submit, so it always ends at review. |

## Electron wiring

- `app.commandLine.appendSwitch("remote-debugging-port", NOMI_CDP_PORT)` (default `9333`) and `remote-debugging-address=127.0.0.1`, enabled only when `NOMI_BROWSER !== "0"`.
- Nomi browser window: `BrowserWindow({ title: "Nomi is browsing", webPreferences: { partition: "persist:nomi-web", sandbox: true, contextIsolation: true, nodeIntegration: false } })`, with no preload, because the pages are untrusted.
- Find the right Playwright page: load `about:blank#nomi-<jobId>` first, find that page among the CDP contexts, then `page.goto(opportunity.url)`. The app's own windows (main, Sprout) are never touched.
- The CDP switch and the `nomi.browser` IPC handlers register from the port's main entry. That's a small edit to a file the port owner controls, so ask first. **Pending port:** on `main` the entry is `desktop/main.js` (CommonJS, no `process.loadEnvFile`), and the only preload, `desktop/preload.js`, loads in the Sprout pet window, not the main window.

## Safety and guards

- **One submit per job:** a job state machine (`preparing → review → submitting → done`). `confirm()` in any state other than `review` is a no-op.
- **One job at a time**, and at most 1 submit per site per minute.
- **Domain lock:** a job only navigates within the opportunity's registrable domain (plus that site's login domain).
- **Stop and hand back (`needs_manual`)** when the page asks for a password, payment, ID or phone verification, or shows a CAPTCHA. Nomi never types passwords and never solves CAPTCHAs.
- **Timeouts:** 20 s per step and 90 s per job, then `error` with a screenshot.
- **Profile data** (`profile.local.json`: name, email, LinkedIn URL, one-liner, what you're building) lives in the app's userData folder or a gitignored local file. A committed `profile.example.json` shows the shape.
- **Answers** to custom questions are ≤ 2 sentences, truthful to the profile and shown in the review card. The user can edit them directly in the visible window before tapping Submit.

## Modes

`NOMI_BROWSER_MODE` = `live` (default in Electron) | `mock`

- In `mock`, `prepare()` emits the full step sequence with realistic delays and a bundled screenshot, and `confirm()` returns `pending_approval`. The Bots teammate builds the UI against this.

## Commands

Script names are proposals; align them with the port's `package.json`.

```bash
npm run desktop                                   # app + Nomi browser available (port's start command)
NOMI_BROWSER_MODE=mock npm run desktop            # UI work without touching real sites
npm run browser:try -- --url https://luma.com/<team-event> --action request   # runs main/browser/try.ts in Electron, no chat UI
npm run browser:signin -- luma                    # open the persistent login window
node --test tests/browser/*.test.ts
npm run typecheck
```

## Project Structure

```
main/browser/index.ts       IPC handlers, job queue, state machine
main/browser/guards.ts      domain lock, rate limit, password/payment/CAPTCHA detection
main/browser/window         Nomi browser window + persistent partition
main/browser/cdp            connectOverCDP and page lookup by #nomi-<jobId>
main/browser/answers        writes custom-question answers with the model client; canned answers without a key
main/browser/recipes/luma
main/browser/recipes/contact-form
main/browser/recipes/meetup
main/browser/recipes/linkedin-assist
main/browser/mock           scripted events for NOMI_BROWSER_MODE=mock
main/browser/try.ts         CLI runner for one job
main/browser/fixtures/      local HTML pages that mimic each flow
tests/browser/              unit tests (state machine, guards, mock, answers)
spikes/cdp-spike.ts         B0 spike, not shipped
profile.example.json
(shared preload bridge)     + nomi.browser namespace, owned by the port
```

## Code Style

TypeScript, matching the repo: double quotes, semicolons, 2-space indent, small functions, a comment for every *why*. Use erasable syntax only (no enums or parameter properties), `import type` for types and `.ts` extensions on relative imports, so the files run under Node's native type stripping.

```ts
// Stop before the button that sends anything; the user approves from the chat review card.
async function prepare(page: Page, job: ActJob, ctx: RecipeContext): Promise<ReviewPayload> {
  ctx.emit("open", "active");
  await page.goto(job.opportunity.url, { waitUntil: "domcontentloaded" });
  if (await page.getByText(/you're (registered|going)/i).isVisible()) {
    return ctx.finish("already_registered");
  }
  await page.getByRole("button", { name: /register|request to join/i }).click();
  ctx.emit("fill", "active");
  await page.getByLabel(/name/i).fill(ctx.profile.name);
  await page.getByLabel(/email/i).fill(ctx.profile.email);
  return ctx.review(await page.screenshot());
}
```

Selectors are role- and label-based (`getByRole`, `getByLabel`, `getByText`), never generated CSS classes, so small site changes don't break recipes.

## Testing Strategy

- **Unit** (`node --test tests/browser/*.test.ts`): the state machine (double confirm, cancel mid-fill, timeout), guards (domain lock, payment/password detection on sample HTML strings), mock event sequence order, and `ActEvent` → milestone mapping.
- **Recipe checks on local fixtures:** small hand-written HTML pages under `main/browser/fixtures/` that mimic each flow's structure (a register button, a questions form, a "you're registered" state). `try.ts --url file://…` runs a recipe against them in Electron.
- **Live end-to-end (manual, before each checkpoint)** on the team-owned Luma event:
  - signed out → `needs_login`
  - sign in → `prepare` → review card
  - Submit → `pending_approval`, and the guest shows up in the host dashboard
  - run again → `already_registered`
- No coverage target. Every guard has a test.

## Boundaries

- **Always:** stop at review before any outbound click; run guards on every navigation; keep the window visible; respect `NOMI_BROWSER_MODE=mock`; keep model and Parallel keys out of the renderer and preload (they live in the main process only).
- **Ask first:** changing the shared contracts (`browser_action` kind); editing the port's main entry or preload bridge (CDP switch, `nomi.browser` namespace); adding `playwright-core`; submitting to any target the team doesn't own; adding a new site recipe beyond the table.
- **Never:** automate LinkedIn connects, DMs or posts; type passwords, payment or ID details; solve or bypass CAPTCHAs; submit without a `confirm()` from the user; run more than one submit per job; drive the user's own Chrome profile; commit `profile.local.json` or session data.

## Success Criteria

1. In `npm run desktop`, tapping **Get me in** on a Luma opportunity opens the "Nomi is browsing" window within 2 s, and a review card with a screenshot appears within 20 s.
2. Tapping **Submit** registers on the team's Luma event, returns `pending_approval` or `submitted`, and the guest appears in Luma's host view.
3. On an event the account is already registered for, the flow returns `already_registered` without clicking anything.
4. When signed out, the flow returns `needs_login`. After `signIn("luma")` and a manual login, retrying works, and the login survives an app restart.
5. Calling `confirm()` twice results in exactly one submission.
6. A fixture page asking for a password or payment ends with `needs_manual` and no submit.
7. The `contact-form` recipe fills and submits the team's test form, and the message arrives in the teammate's inbox.
8. When the bridge has no `browser` namespace, `window.nomi?.browser` is undefined and the chat card shows "Open event page".
9. In `NOMI_BROWSER_MODE=mock` the UI receives open → check_login → fill → review → submit → confirm with no network calls to event sites.
10. Typecheck and the `tests/browser` unit tests pass.

## Open Questions

1. **Port layout (pending port):** where main-process code and the shared preload bridge live once the Electron + React port lands, and who owns them. `main/browser/` is a placeholder. See "Spec conflicts, pending port" in `tasks/plan.md`.
2. **CDP spike:** does `connectOverCDP` see and drive pages in the Electron window reliably on the demo laptop? If not, swap in the `webContents` fallback under the same recipe interface.
3. **Two taps** (Get me in → Submit): is the Bots teammate fine with the `browser_action` kind and a review card in the chat?
4. **Demo identity:** whose Luma/Meetup account signs into the Nomi browser? A dedicated demo account is safer.
5. **Demo targets:** who creates the team Luma event (request-to-join with 2 questions) and the test contact form, and by when?
6. **Plan doc:** `docs/PLAN.md` (PR #5) still says "No public API registers you… Nomi holds the slot in Calendar". If this lands, the pitch changes to "Nomi signs you up, with your OK". Update the plan only after the live end-to-end check passes.
