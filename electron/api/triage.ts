// Owned by Bots. The "what do you need?" box: sort a request into one bot's lane.
import { BOTS } from "@/data/bots";
import { chat } from "@/lib/llm";
import type { BotId, RouteRequest, RouteResponse } from "@/lib/types";

const KEYWORDS: Record<BotId, RegExp> = {
  "health-sports": /climb|gym|run|hike|yoga|swim|cycl|bike|workout|fitness|train|sport|tennis|pickleball|basketball|soccer|sleep|health|stretch|pilates|boulder/,
  "career-growth": /career|job|founder|startup|invest|fundrais|mentor|cofounder|hackathon|demo|pitch|network|hire|hiring|work|cowork|product|\bai\b|build|tech|conference/,
  "social-hobbies": /friend|social|hang|date|party|hobby|music|art|photo|pottery|board game|book club|dinner|brunch|weekend|new in town|meet people|community|club/,
};

export function triageByKeywords(text: string): BotId {
  const lower = text.toLowerCase();
  const scores = (Object.keys(KEYWORDS) as BotId[]).map((id) => ({ id, n: lower.match(new RegExp(KEYWORDS[id], "g"))?.length ?? 0 }));
  scores.sort((a, b) => b.n - a.n);
  return scores[0].n > 0 ? scores[0].id : "social-hobbies";
}

export async function POST(req: Request) {
  const { text } = (await req.json()) as RouteRequest;
  const ids = BOTS.map((b) => b.id);
  const out = await chat(
    [
      {
        role: "system",
        content: `Route a user's request to one Nomi bot. Bots:\n${BOTS.map((b) => `- ${b.id}: ${b.name}. ${b.tagline}`).join("\n")}\nReturn JSON {"botId": one of ${ids.map((i) => `"${i}"`).join("|")}, "reason": "under 12 words, why this bot"}.`,
      },
      { role: "user", content: text },
    ],
    { json: true },
  ).catch(() => null);

  try {
    const parsed = out ? (JSON.parse(out) as Partial<RouteResponse>) : null;
    if (parsed?.botId && ids.includes(parsed.botId)) {
      return Response.json({ botId: parsed.botId, reason: parsed.reason ?? "" } satisfies RouteResponse);
    }
  } catch {
    // fall through to keywords
  }
  const botId = triageByKeywords(text);
  return Response.json({ botId, reason: `Sounds like ${BOTS.find((b) => b.id === botId)?.name}` } satisfies RouteResponse);
}
