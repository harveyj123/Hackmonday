// What Nomi knows about a day from the Mac: its Apple Calendar events. electron/api/context.ts reads the
// real calendar on a Mac; the demo feed below is the fallback elsewhere, or with NOMI_DEMO_CALENDAR=1.

export type ContextItem = {
  kind: "calendar";
  title: string;
  time?: string; // "HH:MM"
  calendar?: string; // the calendar's name, e.g. "Nomi Demo"
};

export type DayContext = { date: string; source: "demo" | "mac"; items: ContextItem[]; error?: string };

export const DEMO_CONTEXT: Record<string, ContextItem[]> = {
  "2026-10-19": [
    { kind: "calendar", title: "Deep work", time: "09:00", calendar: "Nomi Demo" },
    { kind: "calendar", title: "Standup", time: "10:30", calendar: "Nomi Demo" },
    { kind: "calendar", title: "Coffee with Kevin · Sightglass", time: "11:30", calendar: "Nomi Demo" },
    { kind: "calendar", title: "Gym", time: "13:00", calendar: "Nomi Demo" },
    { kind: "calendar", title: "Hackathon demo", time: "15:35", calendar: "Nomi Demo" },
    { kind: "calendar", title: "AI Founders Meetup", time: "18:30", calendar: "Nomi Demo" },
  ],
  "2026-10-22": [{ kind: "calendar", title: "Design review", time: "15:00" }],
  "2026-10-24": [{ kind: "calendar", title: "Lunch with Sam", time: "13:00" }],
};

export function demoContext(date: string): DayContext {
  return { date, source: "demo", items: DEMO_CONTEXT[date] ?? [] };
}

export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// One line for the check-in prompt, e.g. "Calendar 6:00 PM: AI Founders Meetup, SoMa".
export function contextLines(items: ContextItem[]): string[] {
  return items.map((i) => `Calendar ${i.time ? clock(i.time) : ""}: ${i.title}`);
}

// "free until 1:00 PM" from the first calendar event after a given time.
export function freeWindow(items: ContextItem[], from: string): string {
  const next = items.filter((i) => i.kind === "calendar" && i.time && i.time > from).sort((a, b) => a.time!.localeCompare(b.time!))[0];
  return next ? `Calendar: free until ${clock(next.time!)} (${next.title})` : "Calendar: nothing else on today";
}
