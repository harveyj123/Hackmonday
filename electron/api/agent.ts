// Owned by Bots. One turn of a Nomi bot: Parallel to find, open model to decide, Apple Calendar to act.
import type { AgentRequest, AgentResponse } from "@/lib/types";
import { runApprovedAction } from "@/lib/composio";
import { icsLink, type CalendarEvent } from "@/lib/calendar";

export async function POST(req: Request) {
  const body = (await req.json()) as AgentRequest;

  if (body.approve) {
    const last = body.history.findLast((m) => m.approval?.id === body.approve);
    if (last?.approval?.kind === "calendar_hold") {
      const event = last.approval.payload as CalendarEvent;
      return Response.json({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "bot",
            text: "locked in 🗓️ tap to drop it in your calendar",
            card: { title: event.title, subtitle: event.location, url: icsLink(event), cta: "Add to Apple Calendar" },
          },
        ],
        tasks: [],
        status: "calendar hold ready",
      } satisfies AgentResponse);
    }
    const result = last?.approval ? await runApprovedAction(last.approval) : { ok: false, detail: "Nothing to approve" };
    return Response.json({
      messages: [{ id: crypto.randomUUID(), role: "bot", text: result.ok ? "done! sent it 💌" : `hmm, that failed: ${result.detail}` }],
      tasks: [],
      status: result.ok ? "sent" : "error",
    } satisfies AgentResponse);
  }

  // TODO(bots): replace this mock with the tool-calling loop (lib/llm + lib/parallel + lib/composio).
  const ask = body.handoff?.title ?? body.message ?? "";
  const res: AgentResponse = {
    status: "finding events on Luma, Meetup...",
    messages: [
      { id: crypto.randomUUID(), role: "bot", text: "ok I'm on it 👀" },
      { id: crypto.randomUUID(), role: "bot", text: `found a room for "${ask}" this week` },
      {
        id: crypto.randomUUID(),
        role: "bot",
        text: "this one feels very you. want me to hold Thursday night?",
        card: { title: "AI Founders Dinner", subtitle: "Thu 7pm · SoMa · ~30 builders", url: "https://lu.ma" },
        approval: {
          id: "p1",
          kind: "calendar_hold",
          summary: "Hold Thu 7pm for AI Founders Dinner",
          payload: {
            title: "AI Founders Dinner",
            start: "2026-10-23T19:00:00-07:00",
            end: "2026-10-23T21:30:00-07:00",
            location: "SoMa, San Francisco",
            url: "https://lu.ma",
          } satisfies CalendarEvent,
        },
      },
    ],
    tasks: [
      {
        id: "t1",
        botId: body.botId,
        title: "Get you into AI Founders Dinner",
        milestones: [
          { label: "Find", status: "done" },
          { label: "Vet", status: "done" },
          { label: "Calendar hold", status: "active" },
          { label: "Request invite", status: "todo" },
          { label: "Intro", status: "todo" },
        ],
      },
    ],
  };
  return Response.json(res);
}
