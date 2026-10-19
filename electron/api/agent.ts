// Owned by Bots. One conversational turn for a Nomi goal-area agent: Parallel to find, model to decide, Apple Calendar to act.
import { AGENT_MATCHES, detectMatchIntent, type AgentMatch } from "@/data/agent-matches";
import { icsLink, type CalendarEvent } from "@/lib/calendar";
import { runApprovedAction } from "@/lib/composio";
import { chat } from "@/lib/llm";
import { EVENT_DOMAINS, parallelConfigured, search, type SearchResult } from "@/lib/parallel";
import { cached, parseJson, saveCached, withTimeout } from "./live";
import { memoryPrompt, readMemory, updateMemory } from "./memory";
import type { AgentRequest, AgentResponse, BotId, BotTask, ChatMessage, MemoryCandidate, MemoryKind, PendingAction } from "@/lib/types";

const AGENTS: Record<BotId, { name: string; specialty: string; searchHint: string; taskTitle: string; milestones: string[] }> = {
  "career-growth": {
    name: "Career & Growth",
    specialty: "constructing a career environment around the user: relevant people, mentors, collaborators, recurring rooms, professional communities, projects, and concrete opportunities",
    searchHint: "career communities professional events collaborators opportunities",
    taskTitle: "Shape your career environment",
    milestones: ["Goal", "Map people", "Create access", "Follow through"],
  },
  "health-sports": {
    name: "Health & Sports",
    specialty: "constructing an environment that makes healthy behavior natural: training partners, clubs, coaches, recurring spaces, classes, schedules, and supportive routines without diagnosing medical conditions",
    searchHint: "sports fitness classes clubs training communities",
    taskTitle: "Shape your healthy environment",
    milestones: ["Goal", "Map routine", "Set support", "Follow through"],
  },
  "social-hobbies": {
    name: "Social & Hobbies",
    specialty: "constructing a social environment around the user: compatible people, warm introductions, recurring communities, welcoming spaces, hosts, clubs, and shared activities",
    searchHint: "social groups hobby clubs recurring communities events",
    taskTitle: "Shape your social environment",
    milestones: ["Goal", "Map circles", "Create entry", "Follow through"],
  },
};

const MEMORY_KINDS: MemoryKind[] = ["goal", "person", "community", "place", "preference", "constraint", "commitment"];

const INTENT_MILESTONES: Record<NonNullable<ReturnType<typeof detectMatchIntent>>, string[]> = {
  event: ["Find", "Check fit", "Contact host", "Confirm"],
  person: ["Find", "Check fit", "Draft intro", "Arrange"],
  space: ["Find", "Check vibe", "Contact", "Visit"],
  community: ["Find", "Read vibe", "Find entry", "Join"],
  opportunity: ["Scan", "Filter", "Shortlist", "Act"],
};

function isBotId(value: unknown): value is BotId {
  return typeof value === "string" && value in AGENTS;
}

function inferEnvironmentIntent(body: AgentRequest, ask: string): NonNullable<ReturnType<typeof detectMatchIntent>> | null {
  if (/^(hi|hello|hey|yo|thanks|thank you|got it|okay|ok|cool|sounds good)[!.\s]*$/i.test(ask)) return null;
  const remembered = body.memories?.map((memory) => memory.text).join(" ") ?? "";
  const recentConversation = body.history.slice(-8).map((message) => message.text).join(" ");
  const context = `${ask} ${remembered} ${recentConversation}`.toLowerCase();

  if (body.botId === "career-growth" && /fundrais|raising|\braise\b|capital|investor|seed round|pre-seed|series [a-c]|second round/.test(context)) return "community";
  if (body.botId === "social-hobbies" && /new in town|new to (?:the )?(?:city|area)|recently moved/.test(context)) return "community";

  const direct = detectMatchIntent(ask);
  if (direct) return direct;

  if (body.botId === "career-growth") {
    if (/building|startup|founder|launch|product|personal agent|\bai\b/.test(context)) return "event";
    if (/mentor|advisor|introduction|warm intro|cofounder|collaborator/.test(context)) return "person";
    if (/cowork|focus|work around|office/.test(context)) return "space";
    if (/job|role|accelerator|grant|demo/.test(context)) return "opportunity";
  }

  if (body.botId === "health-sports") {
    if (/accountability|training partner|team|new in town|meet people/.test(context)) return "community";
    if (/run|hike|climb|cycle|swim|sport|workout|fitness/.test(context)) return "event";
    if (/gym|studio|court|pool|place to train/.test(context)) return "space";
  }

  if (body.botId === "social-hobbies") {
    if (/new in town|new to|make friends|social circle|belong|meet people/.test(context)) return "community";
    if (/hobby|creative|photo|pottery|music|art|game|fun/.test(context)) return "event";
    if (/someone|person|friend of|introduction/.test(context)) return "person";
  }

  return null;
}

function botTask(botId: BotId, title?: string, intent?: NonNullable<ReturnType<typeof detectMatchIntent>>): BotTask {
  const agent = AGENTS[botId];
  const milestones = intent ? INTENT_MILESTONES[intent] : agent.milestones;
  return {
    id: crypto.randomUUID(),
    botId,
    title: title ?? agent.taskTitle,
    milestones: milestones.map((label, index) => ({
      label,
      status: index === 0 ? "done" : index === 1 ? "active" : "todo",
    })),
  };
}

function nextWeekday(day: number, hour: number): Date {
  const date = new Date();
  const distance = (day - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + distance);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function calendarProposal(botId: BotId): PendingAction {
  const settings: Record<BotId, { day: number; hour: number; minutes: number; title: string }> = {
    "career-growth": { day: 2, hour: 9, minutes: 60, title: "Career growth focus block" },
    "health-sports": { day: 4, hour: 18, minutes: 90, title: "Health & sports session" },
    "social-hobbies": { day: 6, hour: 11, minutes: 120, title: "Social & hobbies time" },
  };
  const setting = settings[botId];
  const start = nextWeekday(setting.day, setting.hour);
  const end = new Date(start.getTime() + setting.minutes * 60_000);
  const event: CalendarEvent = {
    title: setting.title,
    start: start.toISOString(),
    end: end.toISOString(),
    notes: `Planned with Nomi's ${AGENTS[botId].name} agent.`,
  };
  return {
    id: crypto.randomUUID(),
    kind: "calendar_hold",
    summary: `Add ${setting.title.toLowerCase()} to your calendar`,
    payload: event,
  };
}

function wantsCalendar(ask: string): boolean {
  return /schedule|calendar|block|hold|book|this week|twice|three times|routine/i.test(ask);
}

function fallbackMessages(botId: BotId, ask: string, hasMemory: boolean): ChatMessage[] {
  const lower = ask.toLowerCase();
  const greeting = /^(hi|hello|hey|yo|good morning|good afternoon)\b/.test(lower.trim());
  const introductions: Record<BotId, string> = {
    "career-growth": "I’m here to help shape your career environment—the people, rooms, and opportunities around the goal—not just hand you advice.",
    "health-sports": "I’m here to make your offline environment support the way you want to feel and train—not just hand you a workout tip.",
    "social-hobbies": "I’m here to help build the people, places, and recurring activities around the social life you want—not just list events.",
  };
  if (greeting) {
    return [
      { id: crypto.randomUUID(), role: "bot", text: introductions[botId] },
      { id: crypto.randomUUID(), role: "bot", text: hasMemory ? "What changed since we last talked?" : "Give me one goal, your city, and what’s already around you; I’ll map the first useful move." },
    ];
  }

  let texts: string[];
  if (botId === "health-sports" && /pain|injur|dizzy|doctor|medical/.test(lower)) {
    texts = [
      "I don’t want to redesign your routine around something that may need medical attention. Please get pain or dizziness checked by a qualified clinician first.",
      "Once you know what’s safe, I can help line up the right place, schedule, and support around it.",
    ];
  } else {
    const focus: Record<BotId, string> = {
      "career-growth": "the people, rooms, and opportunities that can make it more likely",
      "health-sports": "the routines, places, and people that can make it easier to sustain",
      "social-hobbies": "the people, recurring spaces, and communities where it can happen naturally",
    };
    texts = [
      `I’m treating “${ask.slice(0, 110)}${ask.length > 110 ? "…" : ""}” as an environment-design problem: ${focus[botId]}.`,
      hasMemory ? "I’ll use what I already know about you. What’s the one real-world obstacle blocking this right now?" : "What city are you in, and what have you already tried? Those two details change the next move.",
    ];
  }

  const messages: ChatMessage[] = texts.map((text) => ({ id: crypto.randomUUID(), role: "bot", text }));
  if (wantsCalendar(lower)) {
    messages.push({
      id: crypto.randomUUID(),
      role: "bot",
      text: "I can protect a starter block for you. You’ll approve it before anything is added.",
      approval: calendarProposal(botId),
    });
  }
  return messages;
}

async function liveResults(body: AgentRequest, ask: string, intent: NonNullable<ReturnType<typeof detectMatchIntent>> | null): Promise<SearchResult[]> {
  if (!parallelConfigured() || !intent) return [];
  const botId = body.botId;
  const agent = AGENTS[botId];
  const place = body.memories?.findLast((memory) => memory.kind === "place")?.text ?? "near the user";
  const results = await search(
    `Find one trustworthy, current, high-fit ${intent} for this ${agent.name} goal: ${ask}. Location context: ${place}`,
    [ask, `${agent.searchHint} ${place}`],
    { maxResults: 4, ...(intent === "event" ? { includeDomains: EVENT_DOMAINS } : {}) },
  ).catch(() => null);
  // Keep the last live hit per bot and intent, so a dropped network still shows a real card.
  const key = `agent:${botId}:${intent}`;
  if (results?.length) saveCached(key, results);
  return results?.length ? results : (cached<SearchResult[]>(key) ?? []);
}

function resultMessages(results: SearchResult[]): ChatMessage[] {
  return results.slice(0, 1).map((result) => ({
    id: crypto.randomUUID(),
    role: "bot",
    text: "I found one current option that looks unusually relevant.",
    card: {
      eyebrow: "Current opportunity",
      title: result.title || "Live result",
      subtitle: result.excerpts[0]?.slice(0, 180),
      url: result.url,
      cta: "View more",
    },
  }));
}

function curatedMessages(matches: AgentMatch[], intent: NonNullable<ReturnType<typeof detectMatchIntent>>): ChatMessage[] {
  return matches.slice(0, 1).map((match) => ({
    id: crypto.randomUUID(),
    role: "bot",
    text: match.message,
    card: {
      eyebrow: intent,
      title: match.title,
      subtitle: match.subtitle,
      imageUrl: match.imageUrl,
      url: match.url ?? `https://www.google.com/search?q=${encodeURIComponent(match.title)}`,
      cta: "View more",
      host: match.host,
      why: match.why,
      people: match.people,
    },
    approval: match.action
      ? {
          id: crypto.randomUUID(),
          kind: match.action.kind,
          summary: match.action.summary,
          payload: {
            title: match.title,
            contactName: match.action.contactName,
            subject: match.action.subject,
            draft: match.action.draft,
            profileUrl: match.action.profileUrl,
          },
        }
      : undefined,
  }));
}

function curatedIntro(intent: ReturnType<typeof detectMatchIntent>): ChatMessage {
  const text = intent === "event"
    ? "Ooh, I found one that actually fits—not just another random event."
    : intent === "person"
      ? "I found someone who looks like a genuinely natural fit for you."
      : intent === "space"
        ? "Yep, there’s a place that could change the whole feel of your week."
        : intent === "community"
          ? "I found a community where the vibe—and the way in—both look right for you."
          : "Okay, a couple of these are genuinely worth your time.";
  return { id: crypto.randomUUID(), role: "bot", text };
}

function normalizeModelReply(raw: string): { bubbles: string[]; memories: MemoryCandidate[] } {
  let candidates: string[] = [];
  let memoryCandidates: MemoryCandidate[] = [];
  try {
    const parsed = parseJson<{ messages?: unknown; memories?: unknown }>(raw);
    if (!parsed) throw new Error("not JSON");
    if (Array.isArray(parsed.messages)) {
      candidates = parsed.messages.filter((item): item is string => typeof item === "string");
    }
    if (Array.isArray(parsed.memories)) {
      memoryCandidates = parsed.memories.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const kind = "kind" in item ? item.kind : null;
        const text = "text" in item ? item.text : null;
        if (typeof kind !== "string" || !MEMORY_KINDS.includes(kind as MemoryKind) || typeof text !== "string" || !text.trim()) return [];
        return [{ kind: kind as MemoryKind, text: text.trim().slice(0, 220) }];
      }).slice(0, 4);
    }
  } catch {
    candidates = raw.split(/\n{2,}/);
  }

  const bubbles: string[] = [];
  for (const candidate of candidates) {
    const clean = candidate
      .replace(/\[[^\]]+\]/g, "your details")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    const sentences = clean.match(/[^.!?]+[.!?]+(?:[”"'])?|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [clean];
    let bubble = "";
    let sentenceCount = 0;
    for (const sentence of sentences) {
      if (bubbles.length >= 2) break;
      const next = bubble ? `${bubble} ${sentence}` : sentence;
      if (bubble && (next.length > 260 || sentenceCount >= 2)) {
        bubbles.push(bubble);
        bubble = "";
        sentenceCount = 0;
      }
      if (!bubble && sentence.length > 260) {
        const shortened = sentence.slice(0, 257).replace(/\s+\S*$/, "");
        bubbles.push(`${shortened}…`);
        continue;
      }
      bubble = bubble ? `${bubble} ${sentence}` : sentence;
      sentenceCount += 1;
    }
    if (bubble && bubbles.length < 2) bubbles.push(bubble);
    if (bubbles.length === 2) break;
  }
  return { bubbles: bubbles.slice(0, 2), memories: memoryCandidates };
}

function composeReply(base: ChatMessage[], extras: ChatMessage[]): ChatMessage[] {
  const actions = base.filter((message) => message.approval);
  const friendBubbles = base.filter((message) => !message.approval);
  if (extras.length) {
    const lead = friendBubbles[0];
    const recommendation = { ...extras[0], text: lead?.text ?? extras[0].text };
    return [recommendation, ...friendBubbles.slice(1, 2)].slice(0, 2);
  }
  return [...friendBubbles.slice(0, actions.length ? 1 : 2), ...actions].slice(0, 2);
}

export async function POST(req: Request) {
  const body = (await req.json()) as AgentRequest;
  // The main-process store is the source of truth, so every bot sees what Daily and the others learned.
  const shared = readMemory();
  body.memories = shared.items;
  if (!isBotId(body.botId) || !Array.isArray(body.history)) {
    return Response.json({ error: "A valid bot and conversation history are required" }, { status: 400 });
  }

  if (body.approve) {
    const last = body.history.findLast((message) => message.approval?.id === body.approve);
    if (last?.approval) {
      updateMemory({ events: [{ source: "bot", kind: "booking", text: last.approval.summary, botId: body.botId }] });
    }
    if (last?.approval?.kind === "calendar_hold") {
      const event = last.approval.payload as CalendarEvent;
      return Response.json({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "bot",
            text: "Ready 🗓️ Tap below to add it to your calendar.",
            card: { title: event.title, subtitle: "Your protected time", url: icsLink(event), cta: "Add to Apple Calendar" },
          },
        ],
        tasks: [],
        status: "Calendar hold ready",
      } satisfies AgentResponse);
    }
    if (last?.approval && ["send_email", "request_signup", "send_dm"].includes(last.approval.kind)) {
      const payload = last.approval.payload;
      const title = typeof payload.title === "string" ? payload.title : "Nomi introduction";
      const contactName = typeof payload.contactName === "string" ? payload.contactName : "the contact";
      const draft = typeof payload.draft === "string" ? payload.draft : last.approval.summary;
      const subject = typeof payload.subject === "string" ? payload.subject : title;
      const profileUrl = typeof payload.profileUrl === "string" ? payload.profileUrl : undefined;
      const isDm = last.approval.kind === "send_dm";
      const url = isDm && profileUrl
        ? profileUrl
        : `mailto:?${new URLSearchParams({ subject, body: draft }).toString()}`;
      return Response.json({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "bot",
            text: isDm
              ? `Your message to ${contactName} is ready. Tap below to open their profile, then paste and send it when it feels right.`
              : `Your note to ${contactName} is ready. Tap below to open the draft in your mail app and choose the right address.`,
            card: {
              title: isDm ? `Message ${contactName}` : subject,
              subtitle: draft,
              url,
              cta: isDm ? "Open profile" : "Open email draft",
            },
          },
        ],
        tasks: [],
        status: "Draft ready",
      } satisfies AgentResponse);
    }
    const result = last?.approval ? await runApprovedAction(last.approval) : { ok: false, detail: "Nothing to approve" };
    return Response.json({
      messages: [{ id: crypto.randomUUID(), role: "bot", text: result.ok ? "Done — that’s taken care of." : `That didn’t work: ${result.detail}` }],
      tasks: [],
      status: result.ok ? "Action complete" : "Action failed",
    } satisfies AgentResponse);
  }

  const ask = (body.handoff?.context ? `${body.handoff.title}. ${body.handoff.context}` : body.message ?? "").trim();
  if (!ask) {
    return Response.json({
      messages: [{ id: crypto.randomUUID(), role: "bot", text: "Tell me what you want to make progress on." }],
      tasks: [],
      status: "Ready when you are",
    } satisfies AgentResponse);
  }

  const agent = AGENTS[body.botId];
  const intent = inferEnvironmentIntent(body, ask);
  const results = await liveResults(body, ask, intent);
  const matches = !results.length && intent ? AGENT_MATCHES[body.botId][intent] : [];
  const sourceContext = results.length
    ? `\nCURRENT LIVE OPTIONS (cards will be shown after your text):\n${results.map((result) => `- ${result.title ?? "Untitled"}: ${result.excerpts[0] ?? ""} (${result.url})`).join("\n")}`
    : matches.length
      ? `\nCURATED OFFLINE OPTIONS (cards and proposed actions will be shown after your text):\n${matches.map((match) => `- ${match.title}: ${match.subtitle}. Host: ${match.host ?? "unknown"}. People: ${match.people?.join(", ") ?? "not listed"}. Why it fits: ${match.why ?? match.message}`).join("\n")}`
      : "";
  const memoryContext = `\nSHARED MEMORY ABOUT THE USER (goals, progress, recent days from Nomi Daily, facts from every bot):\n${memoryPrompt(shared)}`;
  const modelReply = await withTimeout(chat([
    {
      role: "system",
      content: `You are Nomi's ${agent.name} personal assistant. Your specialty is ${agent.specialty}.

Your job is to help construct the user's OFFLINE ENVIRONMENT in favor of their goals. You are not a generic advice bot, life coach, therapist, or plain recommendation machine.

Operating principles:
- Treat goals as environment-design problems. Look for leverage in people, recurring places, communities, hosts, events, opportunities, routines, and commitments.
- Use the shared memory. Connect new information to what you already know instead of restarting from zero.
- Every reply must do at least one useful job: connect two known facts, identify one missing fact that blocks action, explain why a real-world option fits, prepare a concrete next action, or learn from the result of a previous action.
- Do not give generic tips, motivational filler, obvious advice, or long lists.
- Do not recommend something merely because it exists. Ground the fit in the user's goal, preferences, constraints, relationships, and location.
- Prefer recurring environments and warm paths in over one-off random events.
- Ask at most one question, and only if its answer changes what you would do next. Make it specific and explain why you need it when useful.
- You may propose a message, introduction, signup, calendar hold, or visit, but never claim an external action happened before approval.
- For medical concerns, recommend appropriate professional care and do not diagnose.

Default interaction style once you know enough:
- Proactively surface ONE best-fit person, community, event, space, activity, or opportunity. Never dump options.
- Start by referencing the remembered goal or current phase: “Since you’re…”, “Now that you’re…”, or “Knowing that…”.
- Explain in one sentence why this specific room or person helps now.
- End with a concrete offer in the first person: “Want me to ask the host…?”, “I can send your demo…”, “I can get the guest list…”, or “I can arrange the intro.”
- The recommendation card and approval action appear directly under your message, so do not narrate UI mechanics.
- Do not give standalone tips when a real-world recommendation or action is possible.
- Resolve words such as “them,” “there,” and “that group” from the recent conversation. Do not answer them as a brand-new topic.
- Never output strategy essays, numbered plans, outreach templates, bracketed placeholders, or generic channel lists unless the user explicitly asks for one.

Nomi's personality:
- Talk like a thoughtful, capable friend who happens to be excellent at making things happen.
- Be natural, direct, supportive, and lightly playful when it fits. Use contractions.
- Never overpraise, lecture, or sound overly polished.

Memory rules:
- Save only durable, useful facts the user states or strongly confirms: goals, important people, communities, places, preferences, real constraints, and commitments.
- Do not save guesses, generic statements, temporary moods, sensitive diagnoses, passwords, secrets, or card details.
- Write memories as short standalone facts that will make a future action more personal.

Reply format:
- Return JSON only: {"messages":["first bubble","optional second bubble"],"memories":[{"kind":"goal|person|community|place|preference|constraint|commitment","text":"durable fact"}]}.
- Return 1 or 2 message bubbles total.
- Every bubble must contain at most 2 sentences and roughly 45 words.
- Write like a real text message, not a memo.
- If option cards follow, use the text to explain the specific fit or the next action; do not repeat card metadata.
- Return an empty memories array when nothing durable was learned.${memoryContext}${sourceContext}`,
    },
    ...body.history.slice(-10).map((message) => ({
      role: message.role === "bot" ? "assistant" as const : "user" as const,
      content: message.text,
    })),
  ], { json: true, timeoutMs: 10_000 }), 18_000, `${agent.name} reply`);

  const normalized = modelReply ? normalizeModelReply(modelReply) : { bubbles: [], memories: [] };
  updateMemory({
    items: normalized.memories,
    events: body.message ? [{ source: "user", kind: "request", text: body.message.slice(0, 160), botId: body.botId }] : [],
  });
  const baseMessages: ChatMessage[] = normalized.bubbles.length
    ? normalized.bubbles.map((text) => ({ id: crypto.randomUUID(), role: "bot", text }))
    : matches.length
      ? [curatedIntro(intent)]
      : fallbackMessages(body.botId, ask, Boolean(body.memories?.length));
  if (normalized.bubbles.length && wantsCalendar(ask) && !matches.length) {
    baseMessages.push({
      id: crypto.randomUUID(),
      role: "bot",
      text: "I can protect a starter block for you. You’ll approve it before anything is added.",
      approval: calendarProposal(body.botId),
    });
  }
  const extras = results.length ? resultMessages(results) : intent ? curatedMessages(matches, intent) : [];
  const messages = composeReply(baseMessages, extras);

  return Response.json({
    messages,
    tasks: [botTask(body.botId, matches[0]?.taskTitle, intent ?? undefined)],
    status: results.length
      ? "Found current options · View actions"
      : matches.length
        ? "Found a strong match · View actions"
        : normalized.memories.length
          ? "Context remembered · View actions"
          : "Environment plan updated · View actions",
    learnedMemories: normalized.memories,
  } satisfies AgentResponse);
}
