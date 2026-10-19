// NOMI_BROWSER_MODE=mock: the full step sequence with realistic delays and a bundled screenshot,
// no network and no window. The Bots teammate builds the chat UI against this.
import type { Runner } from "./types.ts";

// 1x1 placeholder PNG; swap for a real captured review screenshot once B4 can produce one.
const SCREENSHOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export type MockProfile = { name: string; email: string; building?: string };

export function mockRunner(opts: { delayMs?: number; profile: MockProfile }): Runner {
  const delayMs = opts.delayMs ?? 600;
  const pause = () => new Promise((r) => setTimeout(r, delayMs));
  return {
    async prepare(job, ctx) {
      await ctx.step("open", `Opening ${job.opportunity.title}`, pause);
      await ctx.step("check_login", "Checking you're signed in", pause);
      await ctx.step("fill", "Filling in your details", pause);
      const fields = [
        { label: "Name", value: opts.profile.name },
        { label: "Email", value: opts.profile.email },
        ...(job.action === "request" ? [{ label: "What are you building?", value: opts.profile.building ?? "An AI companion that gets you into the right rooms." }] : []),
        ...(job.message ? [{ label: "Message", value: job.message }] : []),
      ];
      return { review: { screenshot: SCREENSHOT, fields, submitLabel: job.action === "request" ? "Request to join" : "Register" } };
    },
    async submit(_job, ctx) {
      await ctx.step("submit", "Sending", pause);
      await ctx.step("confirm", "Reading the confirmation", pause);
      return { outcome: "pending_approval", detail: "pending host approval" };
    },
  };
}
