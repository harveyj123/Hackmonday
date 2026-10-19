// browser-actions contract (SPEC-browser-actions). The renderer sees these over window.nomi.browser (B3).
import type { Opportunity } from "../discovery/types.ts";

export type ActKind = "rsvp" | "request" | "join_group" | "contact" | "connect_assist";

export type ActJob = {
  opportunity: Opportunity; // from discovery
  action: ActKind;
  message?: string; // contact/connect note drafted by the bot engine
};

export type StepId = "open" | "check_login" | "fill" | "review" | "submit" | "confirm";

export type Outcome = "submitted" | "pending_approval" | "already_registered" | "needs_login" | "needs_manual" | "cancelled";

export type ReviewPayload = { screenshot: string /* data:image/png */; fields: { label: string; value: string }[]; submitLabel: string };

export type ActEvent =
  | { jobId: string; type: "step"; step: StepId; status: "active" | "done" | "failed"; label: string }
  | ({ jobId: string; type: "review" } & ReviewPayload)
  | { jobId: string; type: "done"; outcome: Outcome; detail?: string; url: string }
  | { jobId: string; type: "error"; message: string };

// What a recipe (or the mock) does with a page. The job manager owns state, timeouts and guards;
// a runner never decides on its own to submit.
export type RunnerContext = {
  jobId: string;
  signal: AbortSignal; // aborted on cancel or timeout
  step<T>(id: StepId, label: string, fn: () => Promise<T>): Promise<T>; // emits active/done/failed, 20 s cap
  guardUrl(url: string): void; // throws GuardError outside the opportunity's domain
  guardPage(html: string): void; // throws NeedsManual on password, payment, ID, phone check or CAPTCHA
};

export type PrepareResult = { review: ReviewPayload } | { finish: Outcome; detail?: string };

export type Runner = {
  prepare(job: ActJob, ctx: RunnerContext): Promise<PrepareResult>; // never clicks the final submit
  submit(job: ActJob, ctx: RunnerContext): Promise<{ outcome: Outcome; detail?: string }>;
};
