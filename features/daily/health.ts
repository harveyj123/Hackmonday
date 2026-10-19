// Sprout's health, 0 to 100. Days nudge it (green moments grow it, red ones dry it out) and plans move
// it most: going through with one makes Sprout healthier, skipping it makes Sprout wilt a little.
import type { StoryDay } from "./types";

export type HealthEvent = { id: string; date: string; delta: number; reason: string; emoji: string; kind: "plan-done" | "plan-skipped" | "find-passed" };
export type Stage = "wilting" | "droopy" | "healthy" | "thriving" | "blooming";

export const BASE_HEALTH = 50;
export const PLAN_DONE = 15;
export const PLAN_SKIPPED = -12;
// Passing on a bot's find (Not for me, or closing it) wilts Sprout a little.
export const FIND_PASSED = -5;
const KEY = "nomi.health.events";
export const HEALTH_KEY = KEY;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function dayDelta(day: StoryDay) {
  const fit = day.segments.reduce((n, s) => n + s.goalFit, 0);
  return Math.max(-10, Math.min(10, fit * 4));
}

export function loadEvents(): HealthEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as HealthEvent[];
  } catch {
    return [];
  }
}

export function addEvent(e: Omit<HealthEvent, "id">) {
  const all = [...loadEvents(), { ...e, id: `h${Date.now().toString(36)}` }];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  return all;
}

// Health at the end of each day, oldest first. Plan events count on the day they happened.
export function healthByDay(days: StoryDay[], events: HealthEvent[]) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let h = BASE_HEALTH;
  let used = 0;
  const evs = [...events].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((d) => {
    const dayEvents = evs.filter((e) => e.date <= d.date).slice(used);
    used += dayEvents.length;
    const change = dayDelta(d) + dayEvents.reduce((n, e) => n + e.delta, 0);
    h = clamp(h + change);
    return { date: d.date, health: h, change, day: d, events: dayEvents };
  });
}

export function currentHealth(days: StoryDay[], events: HealthEvent[]) {
  const byDay = healthByDay(days, events);
  const last = byDay[byDay.length - 1];
  const lastDate = last?.date ?? "";
  // Plan events after the last checked-in day still count.
  const later = events.filter((e) => e.date > lastDate).reduce((n, e) => n + e.delta, 0);
  return clamp((last?.health ?? BASE_HEALTH) + later);
}

export function stageOf(h: number): Stage {
  return h < 30 ? "wilting" : h < 45 ? "droopy" : h < 60 ? "healthy" : h < 76 ? "thriving" : "blooming";
}

export const STAGE_LABEL: Record<Stage, string> = {
  wilting: "Wilting",
  droopy: "A little droopy",
  healthy: "Healthy",
  thriving: "Thriving",
  blooming: "In bloom",
};
