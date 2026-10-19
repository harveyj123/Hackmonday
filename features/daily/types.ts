// Daily-only types. Shared contracts stay in lib/types.ts.
import type { ActionItem, DayEntry, Goal } from "@/lib/types";

// A generated day plus an optional magazine headline.
export type StoryDay = DayEntry & { headline?: string };

export type PeriodInsight = { emoji: string; title: string; detail: string; tone: "up" | "down" | "flat" };

export type PeriodAnalysis = {
  start: string;
  end: string;
  headline: string;
  score: { up: number; flat: number; down: number };
  insights: PeriodInsight[];
  actionItems: ActionItem[];
};

// POST /api/daily/analyze
export type AnalyzeRequest = { days: StoryDay[]; goals: Goal[] };
export type AnalyzeResponse = PeriodAnalysis;
