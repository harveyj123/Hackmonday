// Owned by Daily. Turns a free-text day into a DayEntry (plus a magazine headline).
import { chat } from "@/lib/llm";
import type { DailyRequest } from "@/lib/types";
import { mockDay, normalizeDay } from "@/features/daily/mock";
import type { StoryDay } from "@/features/daily/types";

const SYSTEM = `You are Nomi, a warm friend who turns someone's day into a one-page magazine storyboard.
Split the day into 3 to 6 segments in time order. For each, score goalFit against the user's goals: 1 pushes toward them, 0 neutral, -1 pulls away.
Keep "why" to one short line. "conversation" is a one-sentence paraphrase of anything notable someone said, or omitted.
Write a punchy magazine "headline" (max 9 words) and a 2 to 3 sentence "summary" spoken to the user as "you".
Add 1 to 3 actionItems: pick the Nomi bot that fits each one: "career-growth" (career rooms, founders, collaborators, opportunities), "health-sports" (training, climbing, routines, gyms) or "social-hobbies" (friends, hobbies, communities, places to belong). Link each to fromSegmentId.
Reply with JSON only.`;

export async function POST(req: Request) {
  const body = (await req.json()) as DailyRequest;
  const text = body.text?.trim() ?? "";

  const prompt = `Goals: ${body.goals.map((g) => `[${g.area}] ${g.text}`).join("; ")}
${body.context?.length ? `From their Mac today (use it to fill in times and places, but the entry wins): ${body.context.join("; ")}\n` : ""}Day: ${text}
Return JSON matching: {headline, segments: [{id, time: "HH:MM", place, people: string[], activity, conversation?, mood: "great"|"good"|"meh"|"low", emoji, goalFit: -1|0|1, why}], summary, actionItems: [{id, botId: "career-growth"|"health-sports"|"social-hobbies", title, context, fromSegmentId}]}`;

  try {
    const out = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      { json: true, provider: process.env.DAILY_LLM_PROVIDER },
    );
    if (out) return Response.json(normalizeDay(body.date, text, JSON.parse(stripFence(out))) satisfies StoryDay);
  } catch (e) {
    console.error("[daily] falling back to mock:", e);
  }
  return Response.json(mockDay(body.date, text) satisfies StoryDay);
}

function stripFence(s: string) {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}
