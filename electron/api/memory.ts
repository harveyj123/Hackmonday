// Owned by Bots. The shared memory every Nomi bot reads: durable facts (Cai's NomiMemory items), goal
// progress, and a feed of recent events. Daily writes check-ins and plan outcomes here; bots write what
// they learn and what the user books. Kept in the main process as JSON under userData so both windows
// and the suggestions scout see the same thing.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { BotId, GoalProgress, MemoryEvent, MemoryUpdate, NomiMemory, SharedMemory } from "@/lib/types";

const MAX_ITEMS = 60;
const MAX_EVENTS = 50;

function file() {
  return path.join(app.getPath("userData"), "nomi-memory.json");
}

const now = () => new Date().toISOString();

// Demo persona from docs/PLAN.md, so the bots already know the user on first launch.
function seed(): SharedMemory {
  const at = now();
  const item = (kind: NomiMemory["kind"], text: string): NomiMemory => ({ id: crypto.randomUUID(), kind, text, createdAt: at });
  return {
    items: [
      item("goal", "Become part of the AI founder scene in SF"),
      item("goal", "Climb twice a week"),
      item("place", "San Francisco (works from home in the Mission)"),
      item("preference", "Small rooms with builders over big mixers"),
      item("person", "Kevin: builds voice agents, met at a SoMa AI meetup"),
    ],
    goals: [
      { id: "g1", title: "Become part of the AI founder scene in SF", botId: "career-growth", progress: 0.35, note: "2 founder events this month", updatedAt: at },
      { id: "g2", title: "Climb twice a week", botId: "health-sports", progress: 0.5, note: "1 of 2 sessions this week", updatedAt: at },
      { id: "g3", title: "Build a regular weekend circle", botId: "social-hobbies", progress: 0.2, note: "No recurring plans yet", updatedAt: at },
    ],
    events: [],
    updatedAt: at,
  };
}

let cache: SharedMemory | null = null;

// The demo person was renamed from Priya to Kevin; fix stores saved before that, so nobody has to delete the file.
function migrate(mem: SharedMemory): SharedMemory {
  const raw = JSON.stringify(mem);
  if (!raw.includes("Priya")) return mem;
  const next = JSON.parse(raw.replaceAll("Priya", "Kevin")) as SharedMemory;
  write(next);
  return next;
}

export function readMemory(): SharedMemory {
  if (cache) return cache;
  try {
    cache = migrate(JSON.parse(fs.readFileSync(file(), "utf8")) as SharedMemory);
  } catch {
    cache = seed();
  }
  return cache;
}

function write(mem: SharedMemory) {
  mem.updatedAt = now();
  cache = mem;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(mem, null, 2));
  } catch (e) {
    console.warn("[memory] could not save", e);
  }
  return mem;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

// A booking or a finished plan nudges the matching goal forward; a skipped plan nudges it back.
function bumpGoal(goals: GoalProgress[], botId: BotId | undefined, delta: number, note: string) {
  const goal = goals.find((g) => g.botId === botId);
  if (!goal) return;
  goal.progress = clamp(goal.progress + delta);
  goal.note = note;
  goal.updatedAt = now();
}

export function updateMemory(update: MemoryUpdate): SharedMemory {
  const mem = structuredClone(readMemory());

  for (const c of update.items ?? []) {
    const text = c.text?.trim();
    if (!text || mem.items.some((m) => m.kind === c.kind && m.text.toLowerCase() === text.toLowerCase())) continue;
    mem.items.push({ kind: c.kind, text, id: crypto.randomUUID(), createdAt: now() });
  }
  mem.items = mem.items.slice(-MAX_ITEMS);

  if (update.daily) {
    const fresh = update.daily.filter((m) => m.id.startsWith("daily-") && m.text?.trim());
    const hadDaily = mem.items.some((m) => m.id.startsWith("daily-"));
    mem.items = [...mem.items.filter((m) => !m.id.startsWith("daily-")), ...fresh];
    // Daily was reset ("start over", ⌥⌘0): put the whole store back to day one too.
    if (hadDaily && !fresh.length) return write(seed());
  }

  if (update.forget) mem.items = mem.items.filter((m) => m.id !== update.forget);

  for (const g of update.goals ?? []) {
    const existing = mem.goals.find((x) => (g.id && x.id === g.id) || x.title.toLowerCase() === g.title.toLowerCase());
    if (existing) Object.assign(existing, { ...g, progress: clamp(g.progress ?? existing.progress), updatedAt: now() });
    else mem.goals.push({ id: g.id ?? crypto.randomUUID(), title: g.title, botId: g.botId, progress: clamp(g.progress ?? 0), note: g.note, updatedAt: now() });
  }

  for (const e of update.events ?? []) {
    const event: MemoryEvent = { at: (e as Partial<MemoryEvent>).at ?? now(), source: e.source, kind: e.kind, text: e.text, botId: e.botId };
    mem.events.unshift(event);
    if (event.kind === "booking" || event.kind === "plan-done") bumpGoal(mem.goals, event.botId, 0.1, event.text);
    if (event.kind === "plan-skipped") bumpGoal(mem.goals, event.botId, -0.05, event.text);
  }
  mem.events = mem.events.slice(0, MAX_EVENTS);

  return write(mem);
}

// ⌥⌘0, "start the demo over": back to the seed.
export function resetMemory(): SharedMemory {
  return write(seed());
}

// The text block every bot prompt gets.
export function memoryPrompt(mem: SharedMemory = readMemory()): string {
  const lines = [
    ...mem.goals.map((g) => `- [goal progress] ${g.title}: ${Math.round(g.progress * 100)}%${g.note ? ` (${g.note})` : ""}`),
    ...mem.items.slice(-30).map((m) => `- [${m.kind}] ${m.text}`),
    ...mem.events.slice(0, 8).map((e) => `- [recent ${e.kind}] ${e.text}`),
  ];
  return lines.length ? lines.join("\n") : "none yet.";
}

export async function GET() {
  return Response.json(readMemory());
}

export async function POST(req: Request) {
  return Response.json(updateMemory((await req.json()) as MemoryUpdate));
}
