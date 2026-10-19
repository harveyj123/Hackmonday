// Offline fallbacks for /api/daily and /api/daily/analyze, plus cleanup for whatever the LLM returns.
// The mock reads the typed day with keyword heuristics, so the demo still reflects what you said.
import type { ActionItem, BotId, DaySegment, Goal, GoalFit, Mood } from "@/lib/types";
import type { PeriodAnalysis, PeriodInsight, StoryDay } from "./types";

const UP = /\b(great|energi[sz]ed|fun|loved|amazing|inspired|good|happy|met|clicked|excited|productive|awesome|nice)\b/i;
const DOWN = /\b(stuck|alone|tired|scroll\w*|bored|drained|skipped|lonely|stressed|anxious|late|sad|wasted|procrastinat\w*)\b/i;
const GOALY = /\b(founder|builder|startup|meetup|ai|climb\w*|boulder\w*|gym|hackathon|demo|pitch|investor|yc)\b/i;

const PLACES: [RegExp, string, string][] = [
  [/\b(meetup|event|talk|demo day|hackathon)\b/i, "Meetup", "🎤"],
  [/\b(climb\w*|boulder\w*|gym)\b/i, "Climbing gym", "🧗"],
  [/\b(coffee|cafe|café)\b/i, "Café", "☕"],
  [/\b(lunch|dinner|breakfast|restaurant|deli|ate)\b/i, "Restaurant", "🍜"],
  [/\b(office|cowork\w*|wework)\b/i, "Office", "🏢"],
  [/\b(park|walk|run|beach)\b/i, "Outside", "🌳"],
  [/\b(bar|drinks|party)\b/i, "Bar", "🍻"],
  [/\b(home|apartment|couch|bed|house)\b/i, "Apartment", "🏠"],
];

const NOT_NAMES = new Set(["I", "I'm", "I've", "Met", "Went", "Then", "Finally", "Later", "Also", "My", "We", "After", "Went", "Had", "Worked", "Spent", "Got", "Lunch", "Dinner", "Coffee", "Morning", "Afternoon", "Evening", "Today", "AI", "SF", "YC", "Zoom", "Slack", "The", "A", "An", "And", "But", "So", "Mission", "SoMa", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

function timeOf(s: string, i: number, n: number) {
  const m = s.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (m) {
    let h = Number(m[1]);
    if ((m[3]?.toLowerCase() === "pm" || (!m[3] && h < 8)) && h < 12) h += 12;
    return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  }
  if (/morning/i.test(s)) return "09:00";
  if (/lunch|noon/i.test(s)) return "12:30";
  if (/afternoon/i.test(s)) return "15:00";
  if (/evening|dinner|night/i.test(s)) return "19:00";
  const h = 9 + Math.round((i * 11) / Math.max(1, n - 1));
  return `${String(h).padStart(2, "0")}:00`;
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+|,?\s+then\s+/i)
    .map((s) => s.trim().replace(/[.!?]+$/, ""))
    .filter((s) => s.length > 3)
    .slice(0, 6);
}

function headlineFor(segs: DaySegment[]) {
  const best = segs.find((s) => s.goalFit === 1);
  const worst = segs.find((s) => s.goalFit === -1);
  if (best && best.people[0]) return `The Day ${best.people[0]} Changed the Plot`;
  if (best) return `${best.place} Was Where the Day Came Alive`;
  if (worst) return `A Day That Needed More Sun`;
  return "An Ordinary Day, Carefully Noted";
}

// "I want to try Sightglass Saturday" is a plan for later, not part of today's story (see plans.ts).
const FUTURE = /\b(want to|wanna|gonna|going to|plan to|hoping to)\b/i;

export function mockDay(date: string, text: string): StoryDay {
  const all = sentences(text);
  const parts = all.filter((s) => !FUTURE.test(s)).length ? all.filter((s) => !FUTURE.test(s)) : all;
  const segments: DaySegment[] = parts.map((s, i) => {
    const place = PLACES.find(([re]) => re.test(s));
    // A person is a capitalized word right after "met", "with" or "and", or right before "who".
    const named = [...s.matchAll(/\b(?:met|with|and)\s+([A-Z][a-z]+)\b|\b([A-Z][a-z]+),?\s+who\b/g)].map((m) => m[1] ?? m[2]);
    const people = [...new Set(named.filter((w) => !NOT_NAMES.has(w)))].slice(0, 3);
    const up = UP.test(s) || (GOALY.test(s) && !DOWN.test(s));
    const down = DOWN.test(s);
    const goalFit: GoalFit = up && !down ? 1 : down ? -1 : 0;
    const mood: Mood = goalFit === 1 ? (UP.test(s) ? "great" : "good") : goalFit === -1 ? "low" : "meh";
    const quote = s.match(/\b(?:said|told me|talked about|building|wants?)\b.+/i)?.[0];
    return {
      id: `s${i + 1}`,
      time: timeOf(s, i, parts.length),
      place: place?.[1] ?? "Around town",
      people,
      activity: s.charAt(0).toUpperCase() + s.slice(1),
      conversation: people.length && quote ? `Talked with ${people[0]} about ${quote.split(/,\s*/)[0].replace(/^(said|told me|talked about)\s*/i, "")}.` : undefined,
      mood,
      emoji: place?.[2] ?? (goalFit === 1 ? "✨" : goalFit === -1 ? "🌧️" : "📝"),
      goalFit,
      why:
        goalFit === 1
          ? people.length
            ? `Time with ${people.join(" and ")} moved you toward your goals.`
            : "This pushed you toward your goals."
          : goalFit === -1
            ? "This drained energy away from your goals."
            : "Neutral for your goals.",
    };
  });
  segments.sort((a, b) => a.time.localeCompare(b.time));

  const best = segments.find((s) => s.goalFit === 1);
  const worst = segments.find((s) => s.goalFit === -1);
  const actionItems: ActionItem[] = [];
  if (best)
    actionItems.push({ id: "a1", botId: "scene-scout", title: best.people[0] ? `Find more rooms with people like ${best.people[0]}` : `Find more moments like ${best.place.toLowerCase()}`, context: best.activity, fromSegmentId: best.id });
  if (worst) actionItems.push({ id: "a2", botId: "third-place", title: "Find a better place for this part of the day", context: worst.activity, fromSegmentId: worst.id });

  const summary =
    best && worst
      ? `Your day turned around at the ${best.place.toLowerCase()}. ${worst.place} time pulled you down; more of the first and less of the second is the move.`
      : best
        ? `A day that moved you forward, mostly thanks to the ${best.place.toLowerCase()}. Worth repeating soon.`
        : worst
          ? `Not much pushed you toward your goals today, and ${worst.place.toLowerCase()} time dragged. Tomorrow needs one plan with people in it.`
          : "A steady, even day. Nothing pulled you off course, and nothing pushed you forward either.";

  return { date, rawText: text, headline: headlineFor(segments), segments, summary, actionItems };
}

// Make a model's JSON safe to render: fill defaults, clamp enums, give everything ids.
export function normalizeDay(date: string, text: string, raw: Record<string, unknown>): StoryDay {
  const moods: Mood[] = ["great", "good", "meh", "low"];
  const bots: BotId[] = ["scene-scout", "third-place"];
  const segs = (Array.isArray(raw.segments) ? raw.segments : []) as Partial<DaySegment>[];
  const segments: DaySegment[] = segs.map((s, i) => {
    const fit = Number(s.goalFit);
    return {
      id: String(s.id ?? `s${i + 1}`),
      time: String(s.time ?? ""),
      place: String(s.place ?? ""),
      people: Array.isArray(s.people) ? s.people.map(String) : [],
      activity: String(s.activity ?? ""),
      conversation: s.conversation ? String(s.conversation) : undefined,
      mood: moods.includes(s.mood as Mood) ? (s.mood as Mood) : "meh",
      emoji: String(s.emoji ?? "📝"),
      goalFit: (fit > 0 ? 1 : fit < 0 ? -1 : 0) as GoalFit,
      why: String(s.why ?? ""),
    };
  });
  const items = (Array.isArray(raw.actionItems) ? raw.actionItems : []) as Partial<ActionItem>[];
  const actionItems: ActionItem[] = items.map((a, i) => ({
    id: String(a.id ?? `a${i + 1}`),
    botId: bots.includes(a.botId as BotId) ? (a.botId as BotId) : "scene-scout",
    title: String(a.title ?? ""),
    context: String(a.context ?? ""),
    fromSegmentId: a.fromSegmentId ? String(a.fromSegmentId) : undefined,
  }));
  if (!segments.length) throw new Error("no segments");
  return {
    date,
    rawText: text,
    headline: raw.headline ? String(raw.headline) : headlineFor(segments),
    segments,
    summary: String(raw.summary ?? ""),
    actionItems,
  };
}

export function mockAnalysis(days: StoryDay[], goals: Goal[]): PeriodAnalysis {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const segs = sorted.flatMap((d) => d.segments);
  const score = {
    up: segs.filter((s) => s.goalFit === 1).length,
    flat: segs.filter((s) => s.goalFit === 0).length,
    down: segs.filter((s) => s.goalFit === -1).length,
  };
  const tally = (pick: (s: DaySegment) => string[], fit: GoalFit) => {
    const m = new Map<string, number>();
    segs.filter((s) => s.goalFit === fit).forEach((s) => pick(s).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const greenPeople = tally((s) => s.people, 1);
  const greenPlaces = tally((s) => [s.place], 1);
  const redPlaces = tally((s) => [s.place], -1);
  const soloRed = segs.filter((s) => s.goalFit === -1 && s.people.length === 0).length;
  const climbs = segs.filter((s) => /climb|boulder/i.test(s.activity + s.place)).length;
  const climbGoal = goals.find((g) => /climb/i.test(g.text));

  const insights: PeriodInsight[] = [];
  if (greenPeople.length)
    insights.push({ emoji: "🤝", title: "People are your accelerant", detail: `Every green moment had someone in it: ${greenPeople.slice(0, 3).join(", ")}. Solo time almost never scored.`, tone: "up" });
  if (redPlaces.length)
    insights.push({ emoji: "🏠", title: `${redPlaces[0]} is where days stall`, detail: `${soloRed} of ${score.down} red moments happened alone, mostly at ${redPlaces[0].toLowerCase()}.`, tone: "down" });
  if (greenPlaces.length)
    insights.push({ emoji: "📍", title: "Your best rooms", detail: `${greenPlaces.slice(0, 3).join(", ")} keep showing up on your best days.`, tone: "up" });
  if (climbGoal)
    insights.push({ emoji: "🧗", title: climbs >= 2 ? "Climbing goal on track" : "Climbing is behind", detail: `${climbs} climbing session${climbs === 1 ? "" : "s"} across ${sorted.length} days, against a goal of twice a week.`, tone: climbs >= 2 ? "up" : "flat" });

  const actionItems: ActionItem[] = [
    { id: "p1", botId: "scene-scout", title: greenPeople[0] ? `Find two more rooms like the ones with ${greenPeople[0]}` : "Find two founder events this week", context: `Across ${sorted.length} days, green moments came from people: ${greenPeople.join(", ") || "none yet"}.` },
    { id: "p2", botId: "third-place", title: "Replace solo apartment hours with a builder co-working spot", context: `${soloRed} red moments were solo, mostly at ${redPlaces[0] ?? "home"}.` },
  ];
  if (climbGoal && climbs < 2)
    actionItems.push({ id: "p3", botId: "third-place", title: "Book two climbing nights with a social crowd", context: `Only ${climbs} climbing session(s) in this stretch; goal is twice a week.` });

  const ratio = score.up - score.down;
  return {
    start: sorted[0]?.date ?? "",
    end: sorted[sorted.length - 1]?.date ?? "",
    headline: ratio > 0 ? "You're trending toward your people" : ratio < 0 ? "Too much time alone, not enough in the right rooms" : "A mixed stretch with clear bright spots",
    score,
    insights: insights.slice(0, 4),
    actionItems,
  };
}
