// Recipe lookup by URL. A forced recipe only applies to local fixture files, never to a real site.
import type { Recipe } from "./types.ts";
import { luma } from "./luma.ts";

export const RECIPES: Recipe[] = [luma];

export function pickRecipe(url: string, forced?: string): Recipe | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol === "file:") return RECIPES.find((r) => r.id === forced) ?? null;
  return RECIPES.find((r) => r.matches(u)) ?? null;
}
