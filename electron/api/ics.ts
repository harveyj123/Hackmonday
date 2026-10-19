// GET /api/ics?title=&start=&end=&location=&url=&notes= returns a calendar file for Apple Calendar.
import { buildIcs, type CalendarEvent } from "@/lib/calendar";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const title = p.get("title");
  const start = p.get("start");
  const end = p.get("end");
  if (!title || !start || !end) return new Response("title, start and end are required", { status: 400 });

  const event: CalendarEvent = {
    title,
    start,
    end,
    location: p.get("location") ?? undefined,
    url: p.get("url") ?? undefined,
    notes: p.get("notes") ?? undefined,
  };
  return new Response(buildIcs(event), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="nomi-event.ics"`,
    },
  });
}
