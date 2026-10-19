// Plans from a check-in ("I want to try Sightglass on Saturday"), and Sprout's nudge on the day.
import { chat } from "@/lib/llm";
import { emojiFor, extractPlansLocally, type NudgeRequest, type NudgeResponse, type Plan, type PlansRequest, type PlansResponse } from "@/features/daily/plans";

const EXTRACT = `You pull future plans out of someone's daily journal entry. A plan is something they say they want or intend to do later
("I want to try Sightglass Saturday morning", "gonna climb Thursday"). Ignore things that already happened.
Resolve weekdays and "tomorrow" against today's date to a YYYY-MM-DD date (the next such day after today), or null if no day is given.
time is when to nudge them, HH:MM: morning 09:00, afternoon 13:00, evening 17:00, otherwise 09:00.
title is short and starts with a verb ("Try Sightglass"). why quotes or paraphrases what they said about it in one line.
Reply with JSON only: {"plans": [{"title", "emoji", "date", "time", "place", "why"}]}. Return {"plans": []} when there are none.`;

const NUDGE = `You are Sprout, a small, warm desktop pet. Today is the day of a plan the user made. Cheer them on to actually go.
headline: max 6 words, like "It's Sightglass day ☕". message: 1 to 2 short sentences, friendly and specific, referencing why they wanted it and
their calendar if useful. No guilt. Reply with JSON only: {"headline", "message"}.`;

const strip = (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

export async function POST(req: Request) {
  const body = (await req.json()) as PlansRequest;
  const text = body.text?.trim() ?? "";
  if (!text) return Response.json({ plans: [] } satisfies PlansResponse);
  const weekday = new Date(body.today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  try {
    const out = await chat(
      [
        { role: "system", content: EXTRACT },
        { role: "user", content: `Today is ${weekday} ${body.today}.\nEntry: ${text}` },
      ],
      { json: true, provider: process.env.DAILY_LLM_PROVIDER },
    );
    if (out) {
      const raw = (JSON.parse(strip(out)).plans ?? []) as Partial<Plan>[];
      const plans: Plan[] = raw
        .filter((p) => p.title)
        .map((p, i) => ({
          id: `p${Date.now().toString(36)}${i}`,
          title: p.title!,
          emoji: p.emoji || emojiFor(p.title!),
          date: /^\d{4}-\d{2}-\d{2}$/.test(p.date ?? "") ? p.date! : null,
          time: /^\d{2}:\d{2}$/.test(p.time ?? "") ? p.time! : "09:00",
          place: p.place || undefined,
          why: p.why || undefined,
          from: body.today,
          status: "upcoming",
        }));
      return Response.json({ plans } satisfies PlansResponse);
    }
  } catch (e) {
    console.error("[plans] falling back to local extraction:", e);
  }
  return Response.json({ plans: extractPlansLocally(text, body.today) } satisfies PlansResponse);
}

export async function NUDGE_POST(req: Request) {
  const { plan, calendar } = (await req.json()) as NudgeRequest;
  try {
    const out = await chat(
      [
        { role: "system", content: NUDGE },
        { role: "user", content: `Plan: ${plan.title}${plan.place ? ` at ${plan.place}` : ""}. They said: ${plan.why ?? "(nothing more)"}. ${calendar}.` },
      ],
      { json: true, provider: process.env.DAILY_LLM_PROVIDER },
    );
    if (out) {
      const r = JSON.parse(strip(out)) as Partial<NudgeResponse>;
      if (r.headline && r.message) return Response.json({ headline: r.headline, message: r.message } satisfies NudgeResponse);
    }
  } catch (e) {
    console.error("[plans] nudge falling back to template:", e);
  }
  const name = plan.title.replace(/^(try|go to|visit|check out|hit)\s+/i, "");
  return Response.json({
    headline: `It's ${name} day ${plan.emoji}`,
    message: plan.source
      ? `${plan.source} found ${plan.title} for you, and today's the day. Go enjoy it, you've earned it.`
      : `You said you wanted to ${/^[A-Z][a-z]/.test(plan.title) ? plan.title[0].toLowerCase() + plan.title.slice(1) : plan.title}, and today's the day. Go enjoy it, you've earned it.`,
  } satisfies NudgeResponse);
}
