// Opportunity -> the shapes the Bots chat already renders: ChatMessage.card and the calendar_hold payload.
import type { InfoCard } from "../../lib/types.ts";
import type { CalendarEvent } from "../../lib/calendar.ts";
import type { JoinMode, Opportunity, OpportunityKind } from "./types.ts";

const CTA: Record<JoinMode, string> = {
  rsvp: "RSVP", request: "Request to join", ticket: "Get a ticket", join_group: "Join group",
  dropin: "View place", contact: "Contact", connect: "View profile",
};

const KIND_LABEL: Record<Exclude<OpportunityKind, "event">, string> = { place: "Place", group: "Community", person: "Person" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Minutes east of UTC from the ISO string itself. We never guess the city's time zone.
function offsetMinutes(iso: string): number {
  const m = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Wall-clock fields at the event's own offset, read off a shifted UTC date.
function wallClock(iso: string): Date {
  return new Date(Date.parse(iso) + offsetMinutes(iso) * 60_000);
}

// "Thu 7pm", "Wed 6:30pm"
function shortTime(iso: string): string {
  const d = wallClock(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${DAYS[d.getUTCDay()]} ${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

function cap(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

// "Thu 7pm · SoMa · ~30 builders"; places and groups lead with their kind instead of a time.
export function toInfoCard(o: Opportunity): InfoCard {
  const when = o.kind === "event" ? (o.start && !Number.isNaN(Date.parse(o.start)) ? shortTime(o.start) : null) : KIND_LABEL[o.kind];
  const where = o.location?.split(",")[0].trim() || null;
  const who = o.whoGoes ? cap(o.whoGoes, 30) : null;
  const subtitle = [when, where, who].filter(Boolean).join(" · ");
  return { title: o.title, ...(subtitle ? { subtitle } : {}), url: o.url, cta: CTA[o.joinMode] };
}

// Same wall-clock offset as the start, so the hold reads naturally in the .ics.
function addHours(iso: string, hours: number): string {
  const off = offsetMinutes(iso);
  const local = new Date(Date.parse(iso) + (off + hours * 60) * 60_000).toISOString().replace(/\.\d{3}Z$/, "");
  if (!/[+-]\d{2}:?\d{2}$/.test(iso)) return `${local}Z`;
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

// Only events with a known start can become a calendar hold; default to a 2-hour slot.
export function toCalendarEvent(o: Opportunity): CalendarEvent | null {
  if (o.kind !== "event" || !o.start || Number.isNaN(Date.parse(o.start))) return null;
  const end = o.end && !Number.isNaN(Date.parse(o.end)) ? o.end : addHours(o.start, 2);
  return {
    title: o.title,
    start: o.start,
    end,
    ...(o.location ? { location: o.location } : {}),
    url: o.url,
    notes: `${o.whyMatch}\n${o.url}`,
  };
}
