// The day's Apple Calendar events. On a Mac this reads the real calendar (macOS asks once to let Nomi use
// Calendar); elsewhere, or with NOMI_DEMO_CALENDAR=1, it serves the demo feed. Each calendar takes about a
// second to search, so NOMI_CALENDARS="Nomi Demo, Work" limits it to those; results are cached for a minute (the nudge reads that), and Today asks for a fresh read.
import { execFile } from "node:child_process";
import { demoContext, type ContextItem, type DayContext } from "@/features/daily/context";

const JXA = (date: string, only: string[]) => `
const cal = Application("Calendar");
const start = new Date("${date}T00:00:00"), end = new Date("${date}T23:59:59");
const only = ${JSON.stringify(only)};
const out = [];
cal.calendars().filter((c) => !only.length || only.includes(c.name())).forEach((c) => {
  try {
    c.events.whose({ _and: [{ startDate: { _greaterThan: start } }, { startDate: { _lessThan: end } }] })().forEach((e) => {
      const s = e.startDate();
      out.push({ title: e.summary(), calendar: c.name(), time: String(s.getHours()).padStart(2, "0") + ":" + String(s.getMinutes()).padStart(2, "0") });
    });
  } catch (err) {}
});
JSON.stringify(out);`;

const cache = new Map<string, { at: number; items: ContextItem[] }>();

function macCalendar(date: string): Promise<ContextItem[]> {
  const only = (process.env.NOMI_CALENDARS ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", JXA(date, only)], { timeout: 30_000 }, (err, stdout) => {
      if (err) return reject(err);
      const events = JSON.parse(stdout || "[]") as { title: string; calendar?: string; time: string }[];
      resolve(events.sort((a, b) => a.time.localeCompare(b.time)).map((e) => ({ kind: "calendar", title: e.title, time: e.time, calendar: e.calendar })));
    });
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const fresh = url.searchParams.has("fresh"); // opening Today or tapping refresh skips the cache
  // On a Mac Today shows only the real calendar; if it can't be read, it says so instead of showing demo events.
  if (process.platform === "darwin" && process.env.NOMI_DEMO_CALENDAR !== "1") {
    const hit = cache.get(date);
    if (!fresh && hit && Date.now() - hit.at < 60_000) return Response.json({ date, source: "mac", items: hit.items } satisfies DayContext);
    try {
      const items = await macCalendar(date);
      cache.set(date, { at: Date.now(), items });
      return Response.json({ date, source: "mac", items } satisfies DayContext);
    } catch (e) {
      console.warn("[context] Apple Calendar unavailable:", e instanceof Error ? e.message : e);
      return Response.json({ date, source: "mac", items: [], error: "Sprout couldn't read your Calendar." } satisfies DayContext);
    }
  }
  return Response.json(demoContext(date));
}
