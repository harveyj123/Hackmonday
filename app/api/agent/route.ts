// Owned by Bots. One turn of a Nomi bot: Parallel to find, open model to decide, Composio to act.
import { NextResponse } from "next/server";
import type { AgentRequest, AgentResponse } from "@/lib/types";
import { runApprovedAction } from "@/lib/composio";

export async function POST(req: Request) {
  const body = (await req.json()) as AgentRequest;

  if (body.approve) {
    const last = body.history.findLast((m) => m.approval?.id === body.approve);
    const result = last?.approval ? await runApprovedAction(last.approval) : { ok: false, detail: "Nothing to approve" };
    return NextResponse.json({
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
        text: "this one feels very you. want me to ask the host?",
        card: { title: "AI Founders Dinner", subtitle: "Thu 7pm · SoMa · ~30 builders", url: "https://lu.ma" },
        approval: { id: "p1", kind: "send_email", summary: "Email the host asking to join Thursday's AI Founders Dinner", payload: {} },
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
          { label: "Contact host", status: "active" },
          { label: "Calendar hold", status: "todo" },
          { label: "Intro", status: "todo" },
        ],
      },
    ],
  };
  return NextResponse.json(res);
}
