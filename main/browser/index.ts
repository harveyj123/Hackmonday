// Browser job manager: one job at a time through preparing → review → submitting → done.
// confirm() is the only path to a submit, and it only works once, from review.
// IPC handlers for window.nomi.browser get added here in B3 (pending port).
import { randomUUID } from "node:crypto";
import type { ActEvent, ActJob, Outcome, ReviewPayload, Runner, RunnerContext, StepId } from "./types.ts";
import { detectBlocker, isAllowedUrl, registrableDomain, SubmitLimiter } from "./guards.ts";

export type JobState = "preparing" | "review" | "submitting" | "done" | "cancelled" | "failed";

class NeedsManual extends Error {}
class TimeoutError extends Error {}

type Job = {
  id: string;
  job: ActJob;
  state: JobState;
  abort: AbortController;
  phase: Promise<void>;
};

const ACTIVE: JobState[] = ["preparing", "review", "submitting"];

// Rejects when the signal aborts, so a hung runner can't hold a job open past cancel or timeout.
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(message)), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function createJobManager(opts: {
  runner: Runner;
  emit: (e: ActEvent) => void;
  now?: () => number;
  limiter?: SubmitLimiter;
  stepTimeoutMs?: number;
  jobTimeoutMs?: number;
}) {
  const { runner, emit } = opts;
  const now = opts.now ?? Date.now;
  const limiter = opts.limiter ?? new SubmitLimiter(60_000);
  const stepTimeoutMs = opts.stepTimeoutMs ?? 20_000;
  const jobTimeoutMs = opts.jobTimeoutMs ?? 90_000;
  const jobs = new Map<string, Job>();

  // Once a job is cancelled the user has moved on; late step events from a stopping runner are dropped.
  const send = (j: Job, e: ActEvent) => {
    if (j.state === "cancelled" && e.type !== "done") return;
    emit(e);
  };
  const step = (j: Job, id: StepId, status: "active" | "done" | "failed", label: string) =>
    send(j, { jobId: j.id, type: "step", step: id, status, label });

  const finish = (j: Job, outcome: Outcome, detail?: string) => {
    j.state = outcome === "cancelled" ? "cancelled" : "done";
    send(j, { jobId: j.id, type: "done", outcome, ...(detail ? { detail } : {}), url: j.job.opportunity.url });
  };

  const fail = (j: Job, e: unknown) => {
    if (j.state === "cancelled") return;
    if (e instanceof NeedsManual) return finish(j, "needs_manual", e.message);
    j.state = "failed";
    send(j, { jobId: j.id, type: "error", message: e instanceof Error ? e.message : String(e) });
  };

  const context = (j: Job): RunnerContext => ({
    jobId: j.id,
    signal: j.abort.signal,
    async step(id, label, fn) {
      step(j, id, "active", label);
      try {
        const out = await Promise.race([withTimeout(fn(), stepTimeoutMs, `${label} timed out after ${stepTimeoutMs / 1000} s`), untilAborted(j.abort.signal)]);
        step(j, id, "done", label);
        return out;
      } catch (e) {
        step(j, id, "failed", label);
        throw e;
      }
    },
    guardUrl(url) {
      if (!isAllowedUrl(j.job.opportunity.url, url)) {
        const host = (() => { try { return new URL(url).host || url; } catch { return url; } })();
        throw new NeedsManual(`navigation to ${host} blocked: outside ${registrableDomain(new URL(j.job.opportunity.url).hostname)}`);
      }
    },
    guardPage(html) {
      const blocker = detectBlocker(html);
      if (blocker) throw new NeedsManual(`page asks for ${blocker.replace("_", " ")}; finish it by hand in the Nomi window`);
    },
  });

  // Each phase gets the job-level time cap; aborting also tells the runner to stop.
  async function run<T>(j: Job, work: () => Promise<T>): Promise<T> {
    const timer = setTimeout(() => j.abort.abort(new TimeoutError(`job timed out after ${jobTimeoutMs / 1000} s`)), jobTimeoutMs);
    try {
      return await Promise.race([work(), untilAborted(j.abort.signal)]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function prepare(job: ActJob): Promise<{ jobId: string }> {
    for (const other of jobs.values()) if (ACTIVE.includes(other.state)) throw new Error("another job is running; finish or cancel it first");
    const j: Job = { id: randomUUID(), job, state: "preparing", abort: new AbortController(), phase: Promise.resolve() };
    jobs.set(j.id, j);
    const ctx = context(j);
    j.phase = run(j, () => runner.prepare(job, ctx)).then(
      (res) => {
        if (j.state !== "preparing") return;
        if ("finish" in res) return finish(j, res.finish, res.detail);
        j.state = "review";
        const r: ReviewPayload = res.review;
        step(j, "review", "active", "Check the form, then tap Submit");
        send(j, { jobId: j.id, type: "review", ...r });
      },
      (e) => fail(j, e),
    );
    return { jobId: j.id };
  }

  async function confirm(jobId: string): Promise<void> {
    const j = jobs.get(jobId);
    if (!j || j.state !== "review") return;
    const site = registrableDomain(new URL(j.job.opportunity.url).hostname);
    const wait = limiter.check(site, now());
    if (wait > 0) {
      send(j, { jobId, type: "error", message: `one submit per site per minute; try again in ${Math.ceil(wait / 1000)} s` });
      return;
    }
    // Flip state before any await so a second confirm in the same tick is a no-op.
    j.state = "submitting";
    limiter.record(site, now());
    step(j, "review", "done", "Approved");
    const ctx = context(j);
    j.phase = run(j, () => runner.submit(j.job, ctx)).then(
      (res) => finish(j, res.outcome, res.detail),
      (e) => fail(j, e),
    );
    await j.phase;
  }

  async function cancel(jobId: string): Promise<void> {
    const j = jobs.get(jobId);
    if (!j || (j.state !== "preparing" && j.state !== "review")) return;
    finish(j, "cancelled");
    j.abort.abort(new Error("cancelled"));
  }

  return {
    prepare,
    confirm,
    cancel,
    state: (jobId: string): JobState | undefined => jobs.get(jobId)?.state,
    // Resolves when the job's current phase (prepare or submit) has finished.
    settled: (jobId: string): Promise<void> => jobs.get(jobId)?.phase ?? Promise.resolve(),
  };
}
