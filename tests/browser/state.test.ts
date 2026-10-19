import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createJobManager } from "../../main/browser/index.ts";
import { mockRunner } from "../../main/browser/mock.ts";
import { milestones } from "../../main/browser/milestones.ts";
import { SubmitLimiter } from "../../main/browser/guards.ts";
import { loadFixtures } from "../../main/discovery/cache.ts";
import type { ActEvent, ActJob, Runner, RunnerContext } from "../../main/browser/types.ts";

const [stepFive] = loadFixtures("career");
const job: ActJob = { opportunity: stepFive, action: "request" };
const review = { screenshot: "data:image/png;base64,AA==", fields: [{ label: "Name", value: "Joey" }], submitLabel: "Request to join" };

// A scripted runner: fills in two steps, then stops at review; submit counts how often it ran.
function fakeRunner(over: Partial<Runner> = {}) {
  const calls = { submit: 0 };
  const runner: Runner = {
    async prepare(_job, ctx) {
      await ctx.step("open", "Opening the event page", async () => ctx.guardUrl(stepFive.url));
      await ctx.step("fill", "Filling in your details", async () => ctx.guardPage("<form><input name=name></form>"));
      return { review };
    },
    async submit(_job, ctx) {
      calls.submit++;
      await ctx.step("submit", "Sending your request", async () => {});
      return { outcome: "pending_approval" };
    },
    ...over,
  };
  return { runner, calls };
}

function setup(runner: Runner, opts: Partial<Parameters<typeof createJobManager>[0]> = {}) {
  const events: ActEvent[] = [];
  const mgr = createJobManager({ runner, emit: (e) => events.push(e), ...opts });
  return { mgr, events };
}

const kinds = (events: ActEvent[]) =>
  events.map((e) => (e.type === "step" ? `${e.step}:${e.status}` : e.type === "done" ? `done:${e.outcome}` : e.type));

test("happy path: preparing → review → submitting → done, with events in order", async () => {
  const { runner, calls } = fakeRunner();
  const { mgr, events } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  assert.equal(mgr.state(jobId), "review");
  await mgr.confirm(jobId);
  assert.equal(mgr.state(jobId), "done");
  assert.equal(calls.submit, 1);
  assert.deepEqual(kinds(events), [
    "open:active", "open:done", "fill:active", "fill:done",
    "review:active", "review", "review:done", // the manager owns the review step: active at review, done on confirm
    "submit:active", "submit:done", "done:pending_approval",
  ]);
  assert.ok(events.every((e) => e.jobId === jobId));
  const done = events.at(-1);
  assert.ok(done?.type === "done" && done.url === stepFive.url);
});

test("confirm twice (even at the same time) submits exactly once", async () => {
  const { runner, calls } = fakeRunner();
  const { mgr } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  await Promise.all([mgr.confirm(jobId), mgr.confirm(jobId)]);
  await mgr.confirm(jobId);
  assert.equal(calls.submit, 1);
});

test("confirm before review is a no-op", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { runner, calls } = fakeRunner({ async prepare() { await gate; return { review }; } });
  const { mgr } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.confirm(jobId);
  assert.equal(mgr.state(jobId), "preparing");
  release();
  await mgr.settled(jobId);
  assert.equal(calls.submit, 0);
  assert.equal(mgr.state(jobId), "review");
});

test("cancel mid-fill aborts the runner, reports cancelled, and blocks a later confirm", async () => {
  let seen: RunnerContext | undefined;
  const { runner, calls } = fakeRunner({
    async prepare(_j, ctx) {
      seen = ctx;
      await new Promise((_, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      return { review };
    },
  });
  const { mgr, events } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.cancel(jobId);
  await mgr.settled(jobId);
  assert.equal(seen?.signal.aborted, true);
  assert.equal(mgr.state(jobId), "cancelled");
  await mgr.confirm(jobId);
  assert.equal(calls.submit, 0);
  assert.deepEqual(kinds(events), ["done:cancelled"]);
});

test("one job at a time: a second prepare is refused until the first finishes", async () => {
  const { runner } = fakeRunner();
  const { mgr } = setup(runner);
  const first = await mgr.prepare(job);
  await mgr.settled(first.jobId);
  await assert.rejects(mgr.prepare(job), /another job/);
  await mgr.cancel(first.jobId);
  const second = await mgr.prepare(job);
  assert.notEqual(second.jobId, first.jobId);
});

test("a step over its timeout fails the step and the job", async () => {
  const { runner } = fakeRunner({
    async prepare(_j, ctx) {
      await ctx.step("fill", "Filling in your details", () => new Promise(() => {}));
      return { review };
    },
  });
  const { mgr, events } = setup(runner, { stepTimeoutMs: 20 });
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  assert.equal(mgr.state(jobId), "failed");
  assert.deepEqual(kinds(events), ["fill:active", "fill:failed", "error"]);
  const err = events.at(-1);
  assert.ok(err?.type === "error" && /timed out/.test(err.message));
});

test("the whole job times out even when no single step does", async () => {
  const { runner } = fakeRunner({ async prepare() { await new Promise((r) => setTimeout(r, 200)); return { review }; } });
  const { mgr, events } = setup(runner, { jobTimeoutMs: 20 });
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  assert.equal(mgr.state(jobId), "failed");
  assert.equal(events.at(-1)?.type, "error");
});

test("a password, payment or CAPTCHA page hands back as needs_manual and never submits", async () => {
  for (const [html, reason] of [['<input type="password">', "password"], ['<input autocomplete="cc-number">', "payment"], ['<div class="g-recaptcha">', "captcha"]]) {
    const { runner, calls } = fakeRunner({
      async prepare(_j, ctx) {
        await ctx.step("fill", "Filling in your details", async () => ctx.guardPage(html));
        return { review };
      },
    });
    const { mgr, events } = setup(runner);
    const { jobId } = await mgr.prepare(job);
    await mgr.settled(jobId);
    await mgr.confirm(jobId);
    assert.equal(calls.submit, 0, reason);
    const done = events.at(-1);
    assert.ok(done?.type === "done" && done.outcome === "needs_manual" && done.detail?.includes(reason), reason);
  }
});

test("navigating off the opportunity's site hands back as needs_manual", async () => {
  const { runner } = fakeRunner({
    async prepare(_j, ctx) {
      await ctx.step("open", "Opening the event page", async () => ctx.guardUrl("https://evil.example/login"));
      return { review };
    },
  });
  const { mgr, events } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  const done = events.at(-1);
  assert.ok(done?.type === "done" && done.outcome === "needs_manual" && /evil\.example/.test(done.detail ?? ""));
});

test("a runner can finish early, e.g. already_registered, without a review", async () => {
  const { runner, calls } = fakeRunner({ async prepare() { return { finish: "already_registered" }; } });
  const { mgr, events } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  await mgr.confirm(jobId);
  assert.equal(calls.submit, 0);
  assert.deepEqual(kinds(events), ["done:already_registered"]);
});

test("a second submit to the same site within a minute waits; the job stays in review", async () => {
  let t = 0;
  const limiter = new SubmitLimiter(60_000);
  const { runner, calls } = fakeRunner();
  const { mgr, events } = setup(runner, { now: () => t, limiter });
  const a = await mgr.prepare(job);
  await mgr.settled(a.jobId);
  await mgr.confirm(a.jobId);
  const b = await mgr.prepare(job);
  await mgr.settled(b.jobId);
  t = 30_000;
  await mgr.confirm(b.jobId);
  assert.equal(mgr.state(b.jobId), "review");
  const err = events.at(-1);
  assert.ok(err?.type === "error" && /30 s/.test(err.message));
  t = 61_000;
  await mgr.confirm(b.jobId);
  assert.equal(mgr.state(b.jobId), "done");
  assert.equal(calls.submit, 2);
});

test("a submit that throws fails the job with an error event", async () => {
  const { runner } = fakeRunner({ async submit() { throw new Error("button vanished"); } });
  const { mgr, events } = setup(runner);
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  await mgr.confirm(jobId);
  assert.equal(mgr.state(jobId), "failed");
  const err = events.at(-1);
  assert.ok(err?.type === "error" && /button vanished/.test(err.message));
});

test("mock mode emits open → check_login → fill → review → submit → confirm with no network", async () => {
  mock.method(globalThis, "fetch", async () => { throw new Error("mock mode must not fetch"); });
  try {
    const { mgr, events } = setup(mockRunner({ delayMs: 0, profile: { name: "Joey", email: "joey@example.com" } }));
    const { jobId } = await mgr.prepare(job);
    await mgr.settled(jobId);
    const rev = events.find((e) => e.type === "review");
    assert.ok(rev?.type === "review" && rev.screenshot.startsWith("data:image/png;base64,"));
    assert.deepEqual(rev.fields.slice(0, 2), [{ label: "Name", value: "Joey" }, { label: "Email", value: "joey@example.com" }]);
    await mgr.confirm(jobId);
    const steps = events.filter((e) => e.type === "step" && e.status === "active").map((e) => (e.type === "step" ? e.step : ""));
    assert.deepEqual(steps, ["open", "check_login", "fill", "review", "submit", "confirm"]);
    const done = events.at(-1);
    assert.ok(done?.type === "done" && done.outcome === "pending_approval");
  } finally {
    mock.restoreAll();
  }
});

test("milestones map step events onto the bot's six milestone bars", async () => {
  const { mgr, events } = setup(mockRunner({ delayMs: 0, profile: { name: "Joey", email: "joey@example.com" } }));
  const { jobId } = await mgr.prepare(job);
  await mgr.settled(jobId);
  assert.deepEqual(milestones(events), [
    { label: "Open", status: "done" },
    { label: "Sign-in", status: "done" },
    { label: "Fill", status: "done" },
    { label: "Review", status: "active" },
    { label: "Submit", status: "todo" },
    { label: "Confirmed", status: "todo" },
  ]);
  await mgr.confirm(jobId);
  assert.ok(milestones(events).every((m) => m.status === "done"));
});
