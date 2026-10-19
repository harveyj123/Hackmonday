// Owned by Daily. Looks across a range of days for patterns and turns them into bot hand-offs.
import { chat } from "@/lib/llm";
import type { ActionItem, BotId } from "@/lib/types";
import { mockAnalysis } from "@/features/daily/mock";
import type { AnalyzeRequest, PeriodAnalysis, PeriodInsight } from "@/features/daily/types";

const SYSTEM = `You are Nomi, a warm friend reviewing several days of someone's life against their goals.
Find the patterns: which people, places and activities push them toward their goals and which pull them away.
Write a short "headline" (max 10 words), 3 to 4 insights ({emoji, title max 7 words, detail one sentence citing specifics, tone: "up"|"down"|"flat"}),
and 2 to 3 actionItems for Nomi bots: botId "career-growth" finds events and people, "social-hobbies" finds spaces and communities. Each has a concrete title and a context line with the evidence.
Speak to the user as "you" in plain words; never mention fit scores, numbers like +1/-1, or dates in 10/16 form (say "Thursday" or "Oct 16").
Reply with JSON only.`;

export async function POST(req: Request) {
  const body = (await req.json()) as AnalyzeRequest;
  const days = [...body.days].sort((a, b) => a.date.localeCompare(b.date));
  const base = mockAnalysis(days, body.goals);

  const digest = days
    .map((d) => `${d.date}: ${d.segments.map((s) => `${s.time} ${s.activity} @ ${s.place}${s.people.length ? ` with ${s.people.join(", ")}` : ""} (fit ${s.goalFit})`).join("; ")}`)
    .join("\n");

  try {
    const out = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Goals: ${body.goals.map((g) => g.text).join("; ")}\nDays:\n${digest}\nReturn JSON: {headline, insights: [...], actionItems: [{id, botId, title, context}]}` },
      ],
      { json: true, provider: process.env.DAILY_LLM_PROVIDER },
    );
    if (out) {
      const raw = JSON.parse(out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
      const bots: BotId[] = ["career-growth", "social-hobbies"];
      const insights: PeriodInsight[] = (raw.insights ?? []).map((i: Partial<PeriodInsight>) => ({
        emoji: String(i.emoji ?? "✨"),
        title: String(i.title ?? ""),
        detail: String(i.detail ?? ""),
        tone: i.tone === "up" || i.tone === "down" ? i.tone : "flat",
      }));
      const actionItems: ActionItem[] = (raw.actionItems ?? []).map((a: Partial<ActionItem>, n: number) => ({
        id: String(a.id ?? `p${n + 1}`),
        botId: bots.includes(a.botId as BotId) ? (a.botId as BotId) : "career-growth",
        title: String(a.title ?? ""),
        context: String(a.context ?? ""),
      }));
      if (insights.length && actionItems.length)
        return Response.json({ ...base, headline: String(raw.headline ?? base.headline), insights, actionItems } satisfies PeriodAnalysis);
    }
  } catch (e) {
    console.error("[daily/analyze] falling back to mock:", e);
  }
  return Response.json(base satisfies PeriodAnalysis);
}
