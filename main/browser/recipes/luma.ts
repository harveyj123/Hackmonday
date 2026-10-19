// Luma: register or request to join. Role- and label-based selectors only, so markup changes hurt less.
import type { Locator, Page } from "playwright-core";
import type { Recipe } from "./types.ts";

const GOING = /you're going|you are going|you're registered|you're in\b|pending approval|on the waitlist|request (sent|received)/i;
const SIGNED_OUT = /sign in to (register|join|rsvp|request)/i;
const OPEN_FORM = /request to join|register|rsvp|join (the )?waitlist|one-click rsvp/i;
const FINAL = /submit|request to join|register|rsvp|confirm/i;
const NAME = /^\s*(full )?name\s*\*?\s*$/i;
const EMAIL = /^\s*email( address)?\s*\*?\s*$/i;

// Pages keep other states in the DOM, hidden; only what's on screen counts.
async function visible(l: Locator): Promise<boolean> {
  return (await l.filter({ visible: true }).count()) > 0;
}

async function screenshot(page: Page): Promise<string> {
  return `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
}

export const luma: Recipe = {
  id: "luma",
  kinds: ["rsvp", "request"],
  matches: (u) => u.hostname === "luma.com" || u.hostname === "lu.ma",

  async prepare(page, job, ctx) {
    const url = job.opportunity.url;
    await ctx.step("open", "Opening the event page", async () => {
      ctx.guardUrl(url);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      ctx.guardUrl(page.url()); // a redirect can't take the job off the site
    });

    const state = await ctx.step("check_login", "Checking you're signed in", async () => {
      if (await visible(page.getByText(GOING))) return "going" as const;
      if (await visible(page.getByText(SIGNED_OUT))) return "signed_out" as const;
      return "ok" as const;
    });
    if (state === "going") return { finish: "already_registered" };
    if (state === "signed_out") return { finish: "needs_login", detail: "Sign in to Luma in the Nomi window, then try again" };

    const fields = await ctx.step("fill", "Filling in your details", async () => {
      await page.getByRole("button", { name: OPEN_FORM }).first().click();
      const form = page.locator("form:visible").first();
      await form.waitFor({ state: "visible" });
      ctx.guardUrl(page.url());
      ctx.guardPage(await page.content());

      const out: { label: string; value: string }[] = [];
      const labels = (await form.locator("label:visible").allTextContents()).map((t) => t.trim()).filter(Boolean);
      const questions = labels.filter((l) => !NAME.test(l) && !EMAIL.test(l));
      const answers = await ctx.answer(questions);
      for (const label of labels) {
        const input = form.getByLabel(label, { exact: true });
        const value = NAME.test(label) ? ctx.profile.name : EMAIL.test(label) ? ctx.profile.email : answers[questions.indexOf(label)];
        // Luma pre-fills name and email for signed-in users; keep what's there.
        if ((await input.inputValue()).trim()) {
          out.push({ label, value: await input.inputValue() });
          continue;
        }
        await input.fill(value);
        out.push({ label, value });
      }
      ctx.guardPage(await page.content());
      return out;
    });

    const submitLabel = (await page.locator("form:visible").first().getByRole("button", { name: FINAL }).first().textContent())?.trim() || "Submit";
    return { review: { screenshot: await screenshot(page), fields, submitLabel } };
  },

  async submit(page, _job, ctx) {
    await ctx.step("submit", "Sending your request", async () => {
      ctx.guardUrl(page.url());
      ctx.guardPage(await page.content());
      await page.locator("form:visible").first().getByRole("button", { name: FINAL }).first().click();
    });
    return ctx.step("confirm", "Reading Luma's confirmation", async () => {
      const note = page.getByText(GOING).filter({ visible: true }).first();
      await note.waitFor({ state: "visible", timeout: 15_000 });
      const text = (await note.textContent()) ?? "";
      return /pending|waitlist|request (sent|received)/i.test(text)
        ? { outcome: "pending_approval" as const, detail: text.trim() }
        : { outcome: "submitted" as const, detail: text.trim() };
    });
  },
};
