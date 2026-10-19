// What Nomi knows about a day from the Mac: Calendar events, Screen Time, Reminders.
// The demo feed below keeps the stage demo the same every run; electron/api/context.ts swaps in the
// real Apple Calendar when NOMI_MAC_CONTEXT=1 on a Mac.

export type ContextItem = {
  kind: "calendar" | "screentime" | "reminder";
  title: string;
  time?: string; // "HH:MM", calendar events only
  detail?: string;
};

export type DayContext = { date: string; source: "demo" | "mac"; items: ContextItem[] };

export const DEMO_CONTEXT: Record<string, ContextItem[]> = {
  "2026-10-19": [
    { kind: "calendar", title: "Standup", time: "10:00" },
    { kind: "calendar", title: "AI Founders Meetup, SoMa", time: "18:00" },
    { kind: "screentime", title: "5 hr in VS Code, 40 min in Messages" },
    { kind: "reminder", title: "Book climbing gym" },
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
  return items.map((i) =>
    i.kind === "calendar" ? `Calendar ${i.time ? clock(i.time) : ""}: ${i.title}` : i.kind === "screentime" ? `Screen Time: ${i.title}` : `Reminder: ${i.title}`,
  );
}

// "free until 1:00 PM" from the first calendar event after a given time.
export function freeWindow(items: ContextItem[], from: string): string {
  const next = items.filter((i) => i.kind === "calendar" && i.time && i.time > from).sort((a, b) => a.time!.localeCompare(b.time!))[0];
  return next ? `Calendar: free until ${clock(next.time!)} (${next.title})` : "Calendar: nothing else on today";
}
