import type { DayEntry } from "@/lib/types";

export const MOCK_DAY: DayEntry = {
  date: "2026-10-19",
  rawText:
    "Worked from my apartment all morning, felt stuck. Lunch alone. Went to an AI meetup at 6, met Priya who's building voice agents, felt energized.",
  segments: [
    { id: "s1", time: "09:00", place: "Apartment", people: [], activity: "Solo work, lots of scrolling", mood: "low", emoji: "🛋️", goalFit: -1, why: "No builders around, energy dipped fast." },
    { id: "s2", time: "12:30", place: "Corner deli", people: [], activity: "Lunch alone", mood: "meh", emoji: "🥪", goalFit: 0, why: "Fine, but a missed chance to meet someone." },
    { id: "s3", time: "18:00", place: "AI meetup, SoMa", people: ["Priya"], activity: "Meetup and demos", conversation: "Priya is building voice agents and wants co-founders.", mood: "great", emoji: "🎤", goalFit: 1, why: "Exactly the room your founder goal needs." },
  ],
  summary:
    "Your energy flipped the moment you were around builders. Mornings at home are dragging you; evenings in the right room are pushing you forward.",
  actionItems: [
    { id: "a1", botId: "career-growth", title: "Find more rooms with builders like Priya", context: "Loved the SoMa AI meetup and meeting Priya (voice agents).", fromSegmentId: "s3" },
    { id: "a2", botId: "career-growth", title: "Find a place to work around builders", context: "Solo mornings at home feel stuck and drain energy.", fromSegmentId: "s1" },
  ],
};

// Seeded past days for the timeline.
export const SEED_DATES = ["2026-10-16", "2026-10-17", "2026-10-18"];
