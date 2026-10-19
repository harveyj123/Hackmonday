// The day's Apple Calendar events. On a Mac this reads the real calendar (macOS asks once to let Nomi use
// Calendar); elsewhere, or with NOMI_DEMO_CALENDAR=1, it serves the demo feed.
import { execFile } from "node:child_process";
import { demoContext, type ContextItem, type DayContext } from "@/features/daily/context";

const JXA = (date: string) => `
const cal = Application("Calendar");
const start = new Date("${date}T00:00:00"), end = new Date("${date}T23:59:59");
const out = [];
cal.calendars().forEach((c) => {
  try {
    c.events.whose({ _and: [{ startDate: { _greaterThan: start } }, { startDate: { _lessThan: end } }] })().forEach((e) => {
      const s = e.startDate();
      out.push({ title: e.summary(), time: String(s.getHours()).padStart(2, "0") + ":" + String(s.getMinutes()).padStart(2, "0") });
    });
  } catch (err) {}
});
JSON.stringify(out);`;

function macCalendar(date: string): Promise<ContextItem[]> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", JXA(date)], { timeout: 8000 }, (err, stdout) => {
      if (err) return reject(err);
      const events = JSON.parse(stdout || "[]") as { title: string; time: string }[];
      resolve(events.sort((a, b) => a.time.localeCompare(b.time)).map((e) => ({ kind: "calendar", title: e.title, time: e.time })));
    });
  });
}

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  if (process.platform === "darwin" && process.env.NOMI_DEMO_CALENDAR !== "1") {
    try {
      return Response.json({ date, source: "mac", items: await macCalendar(date) } satisfies DayContext);
    } catch (e) {
      console.warn("[context] Apple Calendar unavailable, using the demo feed:", e instanceof Error ? e.message : e);
    }
  }
  return Response.json(demoContext(date));
}
