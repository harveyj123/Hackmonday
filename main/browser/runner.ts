// Live runner: gives each job its own Playwright page in the Nomi window and hands it to the site's recipe.
import type { Page } from "playwright-core";
import type { Runner } from "./types.ts";
import type { Profile } from "./profile.ts";
import type { AnswerFn } from "./answers.ts";
import { pickRecipe } from "./recipes/index.ts";

export function playwrightRunner(opts: {
  openPage(jobId: string): Promise<Page>; // window.openJobPage + cdp.connect + cdp.findPage
  profile: Profile;
  answer: AnswerFn;
  forceRecipe?: string; // fixture runs only
}): Runner {
  const pages = new Map<string, Page>();
  const recipeFor = (url: string) => pickRecipe(url, opts.forceRecipe);

  return {
    async prepare(job, ctx) {
      const recipe = recipeFor(job.opportunity.url);
      if (!recipe) return { finish: "needs_manual", detail: "Nomi has no recipe for this site yet; open the page and sign up by hand" };
      const page = await opts.openPage(ctx.jobId);
      pages.set(ctx.jobId, page);
      return recipe.prepare(page, job, { ...ctx, profile: opts.profile, answer: opts.answer });
    },
    async submit(job, ctx) {
      const recipe = recipeFor(job.opportunity.url);
      const page = pages.get(ctx.jobId);
      if (!recipe || !page) throw new Error("this job has no open page to submit");
      try {
        return await recipe.submit(page, job, { ...ctx, profile: opts.profile, answer: opts.answer });
      } finally {
        pages.delete(ctx.jobId);
      }
    },
  };
}
