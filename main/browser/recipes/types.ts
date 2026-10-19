// Recipe interface from SPEC-browser-actions: scripted per site, never clicks the final submit in prepare.
import type { Page } from "playwright-core";
import type { ActJob, ActKind, Outcome, PrepareResult, RunnerContext } from "../types.ts";
import type { Profile } from "../profile.ts";
import type { AnswerFn } from "../answers.ts";

export type RecipeContext = RunnerContext & { profile: Profile; answer: AnswerFn };

export type Recipe = {
  id: string;
  matches(url: URL): boolean;
  kinds: ActKind[];
  prepare(page: Page, job: ActJob, ctx: RecipeContext): Promise<PrepareResult>;
  submit(page: Page, job: ActJob, ctx: RecipeContext): Promise<{ outcome: Outcome; detail?: string }>;
};
