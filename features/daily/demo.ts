// The demo clock. Nomi Daily's "today" starts on the real date and only moves when the presenter skips ahead
// to the next plan's day, so a plan's nudge fires on cue. Reset puts everything back for another rehearsal.
import { SEED_DAYS } from "./seed";
import { addDays, loadPlans, type Plan } from "./plans";
import { SHARED_MEMORY_KEY } from "./memory";
import type { StoryDay } from "./types";

export const DEMO_START = "2026-10-19";
export const DEMO_DAY_KEY = "nomi.demo.today";
const PAST_KEY = "nomi.daily.past";
const ARRIVED_KEY = "nomi.demo.arrived";
// Everything Daily keeps, cleared on reset. The bots' own keys are left alone.
const DAILY_KEYS = ["nomi.daily.today", "nomi.plans", "nomi.health.events", DEMO_DAY_KEY, PAST_KEY, ARRIVED_KEY];

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function demoToday(): string {
  return read<string>(DEMO_DAY_KEY, DEMO_START);
}

// Seeded history plus every day checked in during the demo, oldest first.
export function pastDays(): StoryDay[] {
  return [...SEED_DAYS, ...read<StoryDay[]>(PAST_KEY, [])];
}

// The day of the next plan still to come, or tomorrow when there isn't one.
function nextPlanDay(today: string, plans: Plan[]) {
  const days = plans.filter((p) => p.status === "upcoming" && p.date && p.date > today).map((p) => p.date!);
  return days.sort()[0] ?? addDays(today, 1);
}

// Files today's storyboard under past days and moves "today" forward. Returns the new day.
export function startNextDay(): string {
  const today = demoToday();
  const current = read<{ day?: StoryDay } | null>("nomi.daily.today", null);
  const next = nextPlanDay(today, loadPlans());
  try {
    if (current?.day) localStorage.setItem(PAST_KEY, JSON.stringify([...read<StoryDay[]>(PAST_KEY, []).filter((d) => d.date !== today), current.day]));
    localStorage.removeItem("nomi.daily.today");
    localStorage.setItem(DEMO_DAY_KEY, JSON.stringify(next));
    localStorage.setItem(ARRIVED_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

// True once, right after skipping ahead, so Sprout can greet the new day with its plan.
export function takeArrival(): boolean {
  const arrived = read<string | null>(ARRIVED_KEY, null);
  try {
    localStorage.removeItem(ARRIVED_KEY);
  } catch {}
  return arrived === demoToday();
}

export function resetDemo() {
  try {
    for (const k of DAILY_KEYS) localStorage.removeItem(k);
    const shared = read<{ id: string }[]>(SHARED_MEMORY_KEY, []);
    localStorage.setItem(SHARED_MEMORY_KEY, JSON.stringify(shared.filter((m) => !m.id.startsWith("daily-"))));
  } catch {}
}
