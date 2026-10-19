// Plans: notes like "I want to try Sightglass on Saturday" that Sprout brings up on the day.
// Stored in localStorage on app://nomi, shared by the Sprout and Bots windows.

export type Plan = {
  id: string;
  title: string; // "Try Sightglass"
  emoji: string;
  date: string | null; // YYYY-MM-DD, null when no day was given yet
  time: string; // "HH:MM" Sprout nudges at
  place?: string;
  why?: string; // what the person said about it, used to cheer them on
  from: string; // date of the check-in it came from
  status: "upcoming" | "done" | "skipped";
  source?: string; // the bot that found it, e.g. "Scene Scout"; Daily's own plans leave it empty
  nudged?: boolean;
};

// POST /api/plans
export type PlansRequest = { text: string; today: string };
export type PlansResponse = { plans: Plan[] };

// POST /api/plans/nudge
export type NudgeRequest = { plan: Plan; calendar: string };
export type NudgeResponse = { headline: string; message: string };

const KEY = "nomi.plans";

export function loadPlans(): Plan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Plan[];
  } catch {
    return [];
  }
}

export function savePlans(plans: Plan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch {}
}

export const PLANS_KEY = KEY;

export function nudgeAt(p: Plan): number | null {
  return p.date ? new Date(`${p.date}T${p.time}:00`).getTime() : null;
}

export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function whenLabel(p: Plan) {
  if (!p.date) return "No day yet";
  const d = new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${d} · ${partOfDay(p.time)}`;
}

export function partOfDay(t: string) {
  const h = Number(t.split(":")[0]);
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Fallback when no model is configured: pick "want to X on <day> <time>" phrases out of the text.
export function extractPlansLocally(text: string, today: string): Plan[] {
  const out: Plan[] = [];
  const re = /\b(?:i\s+)?(?:really\s+)?(?:want to|wanna|going to|gonna|plan to|hoping to|need to|should)\s+([^.!?\n]+)/gi;
  for (const m of text.matchAll(re)) {
    let phrase = m[1].trim();
    const lower = phrase.toLowerCase();
    const day = WEEKDAYS.find((w) => lower.includes(w)) ?? (lower.includes("tomorrow") ? "tomorrow" : null);
    const time = /morning/.test(lower) ? "09:00" : /afternoon/.test(lower) ? "13:00" : /(evening|tonight|night|after work)/.test(lower) ? "17:00" : "09:00";
    phrase = phrase
      .replace(/\b(on|this|next|in the|the)\b\s*(?=(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|morning|afternoon|evening|night)\b)/gi, "")
      .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|morning|afternoon|evening|tonight|night)\b/gi, "")
      .replace(/,.*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!phrase || phrase.split(" ").length > 8) continue;
    let date: string | null = null;
    if (day === "tomorrow") date = addDays(today, 1);
    else if (day) {
      const from = new Date(today + "T12:00:00").getDay();
      const diff = (WEEKDAYS.indexOf(day) - from + 7) % 7 || 7;
      date = addDays(today, diff);
    }
    out.push({
      id: `p${Date.now().toString(36)}${out.length}`,
      title: phrase[0].toUpperCase() + phrase.slice(1),
      emoji: emojiFor(phrase),
      date,
      time,
      why: m[0].trim(),
      from: today,
      status: "upcoming",
    });
  }
  return out;
}

export function emojiFor(s: string) {
  const t = s.toLowerCase();
  if (/(coffee|cafe|café|sightglass|blue bottle|latte|cortado)/.test(t)) return "☕";
  if (/(climb|boulder)/.test(t)) return "🧗";
  if (/(run|gym|yoga|swim|hike)/.test(t)) return "🏃";
  if (/(dinner|lunch|brunch|eat|restaurant)/.test(t)) return "🍽️";
  if (/(meetup|event|talk|conference|hackathon|demo night)/.test(t)) return "🎤";
  if (/(cowork|co-working|commons|desk)/.test(t)) return "💻";
  if (/(call|text|email|reach out|meet)/.test(t)) return "🤝";
  if (/(read|book|library)/.test(t)) return "📚";
  return "📌";
}

// A bot's find becomes a plan in Sprout, so Sprout nudges you two hours before it starts.
export function planFromFind(find: { title: string; start?: string; location?: string; why?: string }, source: string, today: string): Plan {
  const date = find.start ? find.start.slice(0, 10) : null;
  const hour = find.start ? Math.max(8, Number(find.start.slice(11, 13)) - 2) : 9;
  return {
    id: `p${Date.now().toString(36)}`,
    title: find.title,
    emoji: emojiFor(`${find.title} ${find.location ?? ""}`),
    date,
    time: `${String(hour).padStart(2, "0")}:${find.start ? find.start.slice(14, 16) : "00"}`,
    place: find.location,
    why: find.why,
    from: today,
    status: "upcoming",
    source,
  };
}

// Add a plan from outside Sprout's window (a bot booking); Sprout picks it up through the storage event.
export function addPlan(plan: Plan) {
  const all = loadPlans().filter((p) => p.title.toLowerCase() !== plan.title.toLowerCase());
  savePlans([...all, plan]);
}
