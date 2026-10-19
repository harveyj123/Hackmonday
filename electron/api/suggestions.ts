// Owned by Bots. Proactive scouting: each bot reads the shared memory, searches Parallel for current
// events, people and communities (Luma, Meetup, Partiful and friends), and the model picks the best fit
// and says why in a friend's voice. Sprout shows these as nudges. Without keys it serves curated picks.
import { BOTS } from "@/data/bots";
import { AGENT_MATCHES, type MatchIntent } from "@/data/agent-matches";
import { chat } from "@/lib/llm";
import { EVENT_DOMAINS, parallelConfigured, search, type SearchResult } from "@/lib/parallel";
import type { BotId, SharedMemory, Suggestion, SuggestionsRequest, SuggestionsResponse } from "@/lib/types";
import { memoryPrompt, readMemory } from "./memory";

const LANE: Record<BotId, { intents: MatchIntent[]; hint: string }> = {
  "career-growth": { intents: ["event", "person", "community"], hint: "founder AI builder meetup demo night" },
  "health-sports": { intents: ["community", "event", "space"], hint: "climbing bouldering run club social" },
  "social-hobbies": { intents: ["community", "event"], hint: "social club hobby meetup weekend" },
};

const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { at: number; list: Suggestion[] }>();

function place(mem: SharedMemory) {
  return mem.items.findLast((m) => m.kind === "place")?.text.split("(")[0].trim() || "San Francisco";
}

function curated(botId: BotId, mem: SharedMemory): Suggestion[] {
  const goal = mem.goals.find((g) => g.botId === botId);
  return LANE[botId].intents.flatMap((intent) =>
    (AGENT_MATCHES[botId][intent] ?? []).slice(0, 1).map((m) => {
      const [when, where] = m.subtitle.split(" · ");
      return {
        id: crypto.randomUUID(),
        botId,
        title: m.title,
        why: m.why ?? (goal ? `Moves "${goal.title}" forward.` : m.message),
        when,
        where,
        url: m.url,
        source: "curated",
        createdAt: new Date().toISOString(),
      } satisfies Suggestion;
    }),
  );
}

async function scout(botId: BotId, mem: SharedMemory): Promise<Suggestion[]> {
  const bot = BOTS.find((b) => b.id === botId)!;
  const goals = mem.goals.filter((g) => g.botId === botId).map((g) => g.title);
  const city = place(mem);
  const results: SearchResult[] =
    (await search(
      `Upcoming events, recurring communities or groups in ${city} in the next two weeks for someone whose goal is: ${goals.join("; ") || bot.tagline}`,
      [`${LANE[botId].hint} ${city}`, `${goals[0] ?? bot.name} ${city} events`],
      { maxResults: 6, includeDomains: EVENT_DOMAINS },
    ).catch((e) => {
      console.warn("[suggestions] parallel failed", e);
      return null;
    })) ?? [];
  if (!results.length) return [];

  const out = await chat(
    [
      {
        role: "system",
        content: `You are Nomi's ${bot.name} bot. From the live results, pick the 1 or 2 that best fit the user's goals and current state right now. Skip anything past, vague or far away.
WHAT NOMI KNOWS:\n${memoryPrompt(mem)}
Return JSON {"picks":[{"index": number, "title": "short name", "why": "one friendly sentence, like texting a friend, tying it to their goal or recent day", "when": "e.g. Thu 7pm, or empty", "where": "neighborhood or venue, or empty"}]}.`,
      },
      { role: "user", content: results.map((r, i) => `${i}. ${r.title ?? "Untitled"} (${r.url}): ${r.excerpts[0]?.slice(0, 300) ?? ""}`).join("\n") },
    ],
    { json: true },
  ).catch(() => null);

  type Pick = { index: number; title?: string; why?: string; when?: string; where?: string };
  let picks: Pick[] = [];
  try {
    picks = out ? ((JSON.parse(out) as { picks?: Pick[] }).picks ?? []) : [];
  } catch {
    picks = [];
  }
  if (!picks.length) picks = [{ index: 0 }];

  return picks
    .filter((p) => results[p.index])
    .slice(0, 2)
    .map((p) => {
      const r = results[p.index];
      return {
        id: crypto.randomUUID(),
        botId,
        title: p.title || r.title || "Something worth a look",
        why: p.why || r.excerpts[0]?.slice(0, 140) || bot.tagline,
        when: p.when || undefined,
        where: p.where || undefined,
        url: r.url,
        source: "parallel",
        createdAt: new Date().toISOString(),
      } satisfies Suggestion;
    });
}

export async function suggestionsFor(botId: BotId): Promise<Suggestion[]> {
  const mem = readMemory();
  const key = `${botId}:${mem.updatedAt}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const live = parallelConfigured() ? await scout(botId, mem) : [];
  const list = live.length ? live : curated(botId, mem);
  cache.set(key, { at: Date.now(), list });
  return list;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as SuggestionsRequest;
  const ids = body.botId ? [body.botId] : (BOTS.map((b) => b.id) as BotId[]);
  const lists = await Promise.all(ids.map(suggestionsFor));
  // Interleave so each bot gets a turn at the top.
  const merged: Suggestion[] = [];
  for (let i = 0; lists.some((l) => l[i]); i++) for (const l of lists) if (l[i]) merged.push(l[i]);
  return Response.json({ suggestions: merged.slice(0, body.limit ?? 6) } satisfies SuggestionsResponse);
}
