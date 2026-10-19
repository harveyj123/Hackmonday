// Owned by Bots. Real upcoming San Francisco events (checked with Parallel Search on Oct 19, 2026), used when a
// live search turns up nothing upcoming, so the demo path always ends in a real, future Calendar invite.
import type { BotId } from "@/lib/types";

export type DemoEvent = { title: string; start: string; end: string; location: string; url: string; why: string };

// Next weekday at a local hour, for the always-open climbing gym option.
function next(day: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + (((day - d.getDay() + 7) % 7) || 7));
  d.setHours(hour, 0, 0, 0);
  return d;
}
const plus = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000).toISOString();

export function demoEvents(botId: BotId): DemoEvent[] {
  const wed = next(3, 19);
  const climb: DemoEvent = {
    title: "Evening bouldering at Dogpatch Boulders",
    start: wed.toISOString(),
    end: plus(wed, 2),
    location: "Dogpatch Boulders, 2573 3rd St",
    url: "https://touchstoneclimbing.com/dogpatch-boulders/",
    why: "Open till 10 PM, no rope partner needed, and an easy room to meet climbers your grade",
  };
  const lists: Record<BotId, DemoEvent[]> = {
    "health-sports": [
      climb,
      {
        title: "Builders who Run SF, 5K",
        start: "2026-10-24T09:00:00-07:00",
        end: "2026-10-24T10:30:00-07:00",
        location: "San Francisco",
        url: "https://foundercal.com/cities/sf/meetups",
        why: "A Saturday run with founders, so the workout counts twice",
      },
    ],
    "career-growth": [
      {
        title: "Durable AI meetup (October edition)",
        start: "2026-10-21T17:30:00-07:00",
        end: "2026-10-21T20:00:00-07:00",
        location: "500 Sansome St",
        url: "https://opensourceaiweek.com/community-events/",
        why: "Temporal and Kernel on long-running agents, a small room of builders",
      },
      {
        title: "Pitch & Run San Francisco",
        start: "2026-10-21T18:30:00-07:00",
        end: "2026-10-21T20:00:00-07:00",
        location: "Willie Mays Gate, Oracle Park",
        url: "https://foundercal.com/cities/sf/meetups",
        why: "Founders pitch investors on a run, free to join",
      },
    ],
    "social-hobbies": [
      {
        title: "SF AI Code and Coffee",
        start: "2026-10-25T14:00:00-07:00",
        end: "2026-10-25T16:00:00-07:00",
        location: "Salesforce Park",
        url: "https://foundercal.com/cities/sf/meetups",
        why: "A relaxed Sunday hang in the park with people who build",
      },
      {
        title: "Scrappy AI Founders Play Soccer",
        start: "2026-10-26T18:00:00-07:00",
        end: "2026-10-26T19:30:00-07:00",
        location: "San Francisco",
        url: "https://foundercal.com/cities/sf/meetups",
        why: "A recurring Monday game, an easy way to see the same faces each week",
      },
    ],
  };
  // Drop anything that has already started; the gym night always stays as a backstop.
  const upcoming = lists[botId].filter((e) => new Date(e.start).getTime() > Date.now());
  return upcoming.length ? upcoming : [climb];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// True when a scraped title or snippet names a date that has already passed ("Fri, Sep 25, 2026").
export function mentionsPastDate(text: string, now = new Date()): boolean {
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/gi;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let found = false;
  let upcoming = false;
  for (const m of text.matchAll(re)) {
    const year = m[3] ? Number(m[3]) : now.getFullYear();
    const t = new Date(year, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), Number(m[2])).getTime();
    if (Number.isNaN(t)) continue;
    found = true;
    if (t >= today) upcoming = true;
  }
  return found && !upcoming;
}
