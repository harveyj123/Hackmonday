"use client";

// iMessage-style thread with a status line and expandable task milestones under the avatar.
import { useEffect, useRef, useState } from "react";
import { TaskProgress } from "./TaskProgress";
import type { ActionItem, AgentRequest, AgentResponse, Bot, BotId, BotTask, ChatMessage } from "@/lib/types";

export function ChatThread({ bot, handoff, onBack }: { bot: Bot; handoff: ActionItem | null; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tasks, setTasks] = useState<BotTask[]>([]);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const sentHandoff = useRef(false);

  async function send(req: Omit<AgentRequest, "botId" | "history">, userText?: string) {
    const history = userText ? [...messages, { id: crypto.randomUUID(), role: "user" as const, text: userText }] : messages;
    setMessages(history);
    setStatus("thinking…");
    const res = await fetch("/api/agent", {
      method: "POST",
      body: JSON.stringify({ botId: bot.id as BotId, history, ...req } satisfies AgentRequest),
    });
    const data = (await res.json()) as AgentResponse;
    // Drip bot bubbles in so it texts like a friend, not one big chunk.
    for (const m of data.messages) {
      await new Promise((r) => setTimeout(r, 600));
      setMessages((prev) => [...prev, m]);
    }
    if (data.tasks.length) setTasks(data.tasks);
    setStatus(data.status);
  }

  useEffect(() => {
    if (handoff && !sentHandoff.current) {
      sentHandoff.current = true;
      send({ handoff }, handoff.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  return (
    <div className="mx-auto flex h-[75vh] max-w-xl flex-col rounded-2xl bg-white shadow-sm">
      <header className="border-b border-stone-100 p-3 text-center">
        <button onClick={onBack} className="float-left text-sm text-sky-600">‹ Bots</button>
        <div className="text-3xl">{bot.emoji}</div>
        <p className="text-sm font-medium">{bot.name}</p>
        {status && (
          <button onClick={() => setExpanded((e) => !e)} className="text-xs text-stone-500">
            {status} {tasks.length > 0 && (expanded ? "▴" : "▾")}
          </button>
        )}
        {expanded && <div className="mt-2 text-left">{tasks.map((t) => <TaskProgress key={t.id} task={t} />)}</div>}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-sky-500 text-white" : "bg-stone-100"}`}>
              <p>{m.text}</p>
              {m.card && (
                <div className="mt-2 rounded-xl bg-white p-2 text-stone-900 shadow-sm">
                  <p className="font-medium">{m.card.title}</p>
                  {m.card.subtitle && <p className="text-xs text-stone-500">{m.card.subtitle}</p>}
                  {m.card.url && (
                    <a href={m.card.url} target="_blank" rel="noreferrer" className="text-xs text-sky-600">{m.card.cta ?? "View more"}</a>
                  )}
                </div>
              )}
              {m.approval && (
                <button
                  onClick={() => send({ approve: m.approval!.id })}
                  className="mt-2 rounded-full bg-emerald-500 px-3 py-1 text-xs text-white"
                >
                  Approve: {m.approval.summary}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-stone-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          send({ message: input }, input);
          setInput("");
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 rounded-full border border-stone-200 px-3 py-1.5 text-sm" placeholder="iMessage-ish…" />
        <button className="rounded-full bg-sky-500 px-3 text-sm text-white">↑</button>
      </form>
    </div>
  );
}
