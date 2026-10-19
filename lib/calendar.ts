// Apple Calendar via .ics: opening the file on a Mac or iPhone adds the event to Calendar. No auth needed.

export type CalendarEvent = {
  title: string;
  start: string; // ISO, e.g. 2026-10-23T19:00:00-07:00
  end: string;
  location?: string;
  url?: string;
  notes?: string;
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nomi//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@nomi`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${escape(e.title)}`,
    e.location && `LOCATION:${escape(e.location)}`,
    e.url && `URL:${e.url}`,
    e.notes && `DESCRIPTION:${escape(e.notes)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

// Link the chat can show as "Add to Apple Calendar".
export function icsLink(e: CalendarEvent): string {
  return `/api/ics?${new URLSearchParams(Object.entries(e).filter(([, v]) => v) as [string, string][])}`;
}
