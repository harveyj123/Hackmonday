// Owned by Daily. Turns a free-text day into a DayEntry.
import { NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { DailyRequest, DailyResponse } from "@/lib/types";
import { MOCK_DAY } from "@/data/mock-day";

export async function POST(req: Request) {
  const body = (await req.json()) as DailyRequest;

  const prompt = `Goals: ${body.goals.map((g) => g.text).join("; ")}
Day: ${body.text}
Return JSON matching: {segments: [{id, time, place, people[], activity, conversation?, mood: "great"|"good"|"meh"|"low", emoji, goalFit: -1|0|1, why}], summary, actionItems: [{id, botId: "scene-scout"|"third-place", title, context, fromSegmentId}]}`;

  const out = await chat(
    [
      { role: "system", content: "You are Nomi, a warm friend who turns someone's day into a storyboard. Reply with JSON only." },
      { role: "user", content: prompt },
    ],
    { json: true },
  ).catch(() => null);

  if (!out) return NextResponse.json({ ...MOCK_DAY, date: body.date, rawText: body.text } satisfies DailyResponse);
  const parsed = JSON.parse(out);
  return NextResponse.json({ date: body.date, rawText: body.text, ...parsed } satisfies DailyResponse);
}
