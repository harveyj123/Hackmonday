// Daily's side of shared memory. Nomi Daily works out goal progress over the week and month, and the people,
// places and plans in your days, then writes them as plain memory entries into the store every Nomi bot
// reads. The Bots side owns that store (Cai's shape: { id, kind, text, createdAt } in localStorage); Daily
// replaces only its own entries, the ones whose id starts with "daily-".
import { DEMO_GOALS } from "@/lib/goals";
import type { Goal } from "@/lib/types";
import { addDays, whenLabel, type Plan } from "./plans";
import { stageOf, STAGE_LABEL } from "./health";
import type { StoryDay } from "./types";

export const SHARED_MEMORY_KEY = "nomi-shared-memory-v4";

export type GoalProgress = {
  goal: Goal;
  unit: string; // "climbs", "new builders met"
  week: { done: number; target: number };
  month: { done: number; target: number };
};

export type DailyMemoryEntry = { id: string; kind: "goal" | "person" | "place" | "commitment"; text: string; createdAt: string };

const CLIMB = /climb|boulder/i;

// Demo goals get specific measures; any other goal counts its green moments.
function measure(goal: Goal, days: StoryDay[], plans: Plan[]) {
  const inRange = (d: string, from: string) => d >= from;
  if (goal.area === "health" && CLIMB.test(goal.text)) {
    return {
      unit: "climbs",
      perWeek: 2,
      count: (from: string) =>
        days.filter((d) => inRange(d.date, from)).reduce((n, d) => n + d.segments.filter((s) => CLIMB.test(`${s.activity} ${s.place}`)).length, 0) +
        plans.filter((p) => p.status === "done" && p.date && inRange(p.date, from) && CLIMB.test(p.title)).length,
    };
  }
  if (goal.area === "career") {
    return {
      unit: "new builders met",
      perWeek: 3,
      count: (from: string) => new Set(days.filter((d) => inRange(d.date, from)).flatMap((d) => d.segments.filter((s) => s.goalFit === 1).flatMap((s) => s.people))).size,
    };
  }
  return {
    unit: "steps toward it",
    perWeek: 4,
    count: (from: string) => days.filter((d) => inRange(d.date, from)).reduce((n, d) => n + d.segments.filter((s) => s.goalFit === 1).length, 0),
  };
}

// Progress over the last 7 and 30 days, counting plans you went through with.
export function goalProgress(today: string, days: StoryDay[], plans: Plan[]): GoalProgress[] {
  return DEMO_GOALS.map((goal) => {
    const m = measure(goal, days, plans);
    return {
      goal,
      unit: m.unit,
      week: { done: m.count(addDays(today, -6)), target: m.perWeek },
      month: { done: m.count(addDays(today, -29)), target: m.perWeek * 4 },
    };
  });
}

export function dailyMemories({ today, days, plans, health }: { today: string; days: StoryDay[]; plans: Plan[]; health: number }): DailyMemoryEntry[] {
  const now = new Date().toISOString();
  const entry = (id: string, kind: DailyMemoryEntry["kind"], text: string): DailyMemoryEntry => ({ id: `daily-${id}`, kind, text, createdAt: now });
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const out: DailyMemoryEntry[] = goalProgress(today, days, plans).map((g) =>
    entry(`goal-${g.goal.id}`, "goal", `${g.goal.text}: ${g.week.done} of ${g.week.target} ${g.unit} this week, ${g.month.done} of ${g.month.target} this month`),
  );
  out.push(entry("sprout", "goal", `Overall momentum (Sprout's health): ${Math.round(health)}/100, ${STAGE_LABEL[stageOf(health)].toLowerCase()}`));

  const seen = new Set<string>();
  for (const d of sorted)
    for (const s of d.segments)
      for (const name of s.people) {
        if (seen.has(name)) continue;
        seen.add(name);
        out.push(entry(`person-${name.toLowerCase()}`, "person", `${name}: ${s.conversation ?? `${s.activity} at ${s.place}`} (${d.date})`));
      }

  const places = new Map<string, number>();
  for (const d of sorted) for (const s of d.segments) if (s.place) places.set(s.place, (places.get(s.place) ?? 0) + s.goalFit);
  for (const [place, fit] of places)
    out.push(entry(`place-${place.toLowerCase().replace(/\W+/g, "-")}`, "place", `${place} ${fit > 0 ? "tends to be a good day for the goals" : fit < 0 ? "tends to drag the goals down" : "is neutral for the goals"}`));

  for (const p of plans.filter((p) => p.status === "upcoming"))
    out.push(entry(`plan-${p.id}`, "commitment", `Plan: ${p.title} (${whenLabel(p)})${p.source ? `, found by ${p.source}` : ""}`));
  return out;
}

// Replace Daily's entries in the shared store and keep everything the bots learned.
export function writeDailyMemories(entries: DailyMemoryEntry[]) {
  try {
    const all = JSON.parse(localStorage.getItem(SHARED_MEMORY_KEY) ?? "[]") as { id: string }[];
    localStorage.setItem(SHARED_MEMORY_KEY, JSON.stringify([...all.filter((m) => !m.id.startsWith("daily-")), ...entries]));
  } catch {}
}

export function readSharedMemories(): unknown[] {
  try {
    return JSON.parse(localStorage.getItem(SHARED_MEMORY_KEY) ?? "[]") as unknown[];
  } catch {
    return [];
  }
}
