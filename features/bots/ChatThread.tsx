"use client";

// Conversation view with Grok-style compact bubbles and Nomi's approval/task controls.
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TaskProgress } from "./TaskProgress";
import type { ActionItem, AgentRequest, AgentResponse, Bot, BotId, BotTask, ChatMessage, MemoryCandidate, NomiMemory } from "@/lib/types";

function welcomeMessage(bot: Bot): ChatMessage {
  const welcomes: Record<string, string> = {
    "career-growth": "Tell me the career goal you’re moving toward and what your world looks like now—your city, people, and communities. I’ll help shape the right rooms and opportunities around you.",
    "health-sports": "Tell me what you want your health or sport life to become and what currently surrounds you. I’ll help make the right routines, places, and people easier to fall into.",
    "social-hobbies": "Tell me what you want more of in your social life and what your current circles look like. I’ll help build a real-world environment where that can happen naturally.",
  };
  const text = welcomes[bot.id] ?? "What would you like to work on?";
  return { id: `welcome-${bot.id}`, role: "bot", text };
}

function activeStatus(request: Omit<AgentRequest, "botId" | "history">, bot: Bot): string {
  if (request.approve) return "Preparing the next step…";
  const text = `${request.message ?? ""} ${request.handoff?.title ?? ""}`.toLowerCase();
  if (/event|activit|host|sign.?up|ticket/.test(text)) return "Finding an event and checking the host…";
  if (/people|person|someone|hang out|dm|message them/.test(text)) return "Looking for someone you’d click with…";
  if (/space|cowork|studio|gym|atmosphere|environment/.test(text)) return "Comparing spaces and their atmosphere…";
  if (/communit|club|vibe|group|belong/.test(text)) return "Reading the community vibe…";
  if (/opportunit|town|city|happening/.test(text)) return "Scanning opportunities around town…";
  return bot.id === "health-sports" ? "Putting together a realistic next step…" : "Thinking it through with you…";
}

export type ChatSession = {
  messages: ChatMessage[];
  tasks: BotTask[];
  status: string;
};

export function ChatThread({
  bot,
  handoff,
  avatar,
  initialSession,
  memories,
  onSessionChange,
  onMemoriesLearned,
  onForgetMemory,
  onBack,
  onOpenDaily,
}: {
  bot: Bot;
  handoff: ActionItem | null;
  avatar: ReactNode;
  initialSession?: ChatSession;
  memories: NomiMemory[];
  onSessionChange: (session: ChatSession) => void;
  onMemoriesLearned: (memories: MemoryCandidate[]) => void;
  onForgetMemory: (id: string) => void;
  onBack: () => void;
  onOpenDaily?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession?.messages ?? [welcomeMessage(bot)]);
  const [tasks, setTasks] = useState<BotTask[]>(initialSession?.tasks ?? []);
  const [status, setStatus] = useState(initialSession?.status ?? "Ready when you are");
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const sentHandoff = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, expanded]);

  useEffect(() => {
    onSessionChange({ messages, tasks, status });
  }, [messages, tasks, status, onSessionChange]);

  async function send(req: Omit<AgentRequest, "botId" | "history">, userText?: string) {
    if (sending) return;
    const nextHistory = userText
      ? [...messages, { id: crypto.randomUUID(), role: "user" as const, text: userText }]
      : messages;
    setMessages(nextHistory);
    setSending(true);
    setStatus(activeStatus(req, bot));

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botId: bot.id as BotId, history: nextHistory, memories, ...req } satisfies AgentRequest),
      });
      if (!res.ok) throw new Error("The bot could not respond");
      const data = (await res.json()) as AgentResponse;
      onMemoriesLearned(data.learnedMemories ?? []);
      for (const message of data.messages) {
        await new Promise((resolve) => setTimeout(resolve, 420));
        setMessages((current) => [...current, message]);
      }
      if (data.tasks.length) {
        setTasks(data.tasks);
      } else if (req.approve) {
        setTasks((current) => current.map((task) => ({
          ...task,
          milestones: task.milestones.map((milestone) => ({ ...milestone, status: "done" as const })),
        })));
      }
      setStatus(data.status);
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "bot", text: "I hit a snag. Give me a second and try that again." },
      ]);
      setStatus("Couldn’t connect");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (handoff && !sentHandoff.current) {
      sentHandoff.current = true;
      void send({ handoff }, handoff.title);
    }
    // Handoffs arrive once when the chat is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <header className="relative flex h-14 shrink-0 items-center border-b border-black/8 px-4 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="mr-3 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-500 hover:bg-black/5 min-[500px]:hidden"
          aria-label="Back to bots"
        >
          ‹
        </button>
        {avatar}
        <div className="ml-2.5 min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{bot.name}</p>
          <button
            type="button"
            onClick={() => tasks.length && setExpanded((value) => !value)}
            className={`flex items-center gap-1 truncate text-[11px] ${sending ? "text-blue-500" : "text-neutral-400"}`}
          >
            {sending && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />}
            {status}
            {tasks.length > 0 && <span>{expanded ? "▴" : "▾"}</span>}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowMemory((value) => !value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${showMemory ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-black/5 hover:text-neutral-900"}`}
          >
            Memory{memories.length ? ` · ${memories.length}` : ""}
          </button>
          {onOpenDaily && <button
            type="button"
            onClick={onOpenDaily}
            className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 md:block"
          >
            Nomi Daily
          </button>}
          <button type="button" aria-label="Conversation options" className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-800">
            ···
          </button>
        </div>

        {showMemory && (
          <div className="absolute right-4 top-[50px] z-30 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between border-b border-black/[0.06] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">What Nomi remembers</p>
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">Shared across all three assistants. You’re always in control.</p>
              </div>
              <button type="button" onClick={() => setShowMemory(false)} aria-label="Close memory" className="ml-3 text-lg leading-none text-neutral-400 hover:text-neutral-800">×</button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {memories.length === 0 ? (
                <div className="px-3 py-7 text-center">
                  <p className="text-sm font-medium text-neutral-700">Nothing saved yet</p>
                  <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-neutral-400">Nomi will remember useful goals, people, places, preferences, and constraints as you talk.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {memories.map((memory) => (
                    <div key={memory.id} className="group flex items-start gap-2 rounded-xl px-3 py-2.5 hover:bg-neutral-50">
                      <span className="mt-0.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{memory.kind}</span>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-neutral-700">{memory.text}</p>
                      <button
                        type="button"
                        onClick={() => onForgetMemory(memory.id)}
                        aria-label={`Forget ${memory.text}`}
                        className="shrink-0 text-base leading-none text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {expanded && tasks.length > 0 && (
        <div className="shrink-0 border-b border-black/5 bg-[#fafafa] px-5 py-3">
          <div className="mx-auto max-w-[680px] space-y-2">
            {tasks.map((task) => <TaskProgress key={task.id} task={task} />)}
          </div>
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-7 sm:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col">
          <p className="mb-7 text-center text-[11px] font-medium text-neutral-400">Today · {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
          <div className="space-y-2.5">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[88%] sm:max-w-[74%]">
                    <div
                      className={`rounded-[18px] px-4 py-2.5 text-[14px] leading-[1.4] ${
                        isUser
                          ? "rounded-br-[5px] bg-black text-white"
                          : "rounded-bl-[5px] bg-[#eeeeee] text-neutral-900"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    </div>

                    {message.card && (
                      <article className="mt-2 overflow-hidden rounded-2xl border border-black/[0.08] bg-white text-neutral-900 shadow-[0_8px_28px_rgba(0,0,0,0.07)]">
                        <div className="flex min-h-[96px]">
                          {message.card.imageUrl && (
                            <div className="w-[104px] shrink-0 overflow-hidden bg-neutral-100 sm:w-[124px]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.card.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={(event) => { event.currentTarget.parentElement?.classList.add("hidden"); }}
                              />
                            </div>
                          )}
                          <div className="flex min-w-0 flex-1 flex-col p-3.5">
                            {message.card.eyebrow && (
                              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-orange-600">{message.card.eyebrow}</p>
                            )}
                            <p className="text-sm font-semibold leading-snug">{message.card.title}</p>
                            {message.card.subtitle && (
                              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-500">{message.card.subtitle}</p>
                            )}
                            {message.card.host && (
                              <p className="mt-2 text-[11px] text-neutral-500"><span className="font-semibold text-neutral-700">Hosted by</span> {message.card.host}</p>
                            )}
                            {message.card.people && message.card.people.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="flex -space-x-1.5">
                                  {message.card.people.slice(0, 4).map((person) => (
                                    <span
                                      key={person}
                                      title={person}
                                      className="grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-neutral-900 text-[8px] font-semibold text-white last:bg-neutral-200 last:text-neutral-600"
                                    >
                                      {person.startsWith("+") ? person : person.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                                    </span>
                                  ))}
                                </div>
                                <span className="text-[10px] font-medium text-neutral-400">People you may meet</span>
                              </div>
                            )}
                            {message.card.why && (
                              <div className="mt-2 rounded-lg bg-[#f7f6f2] px-2.5 py-2">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">Why it fits</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600">{message.card.why}</p>
                              </div>
                            )}
                            {message.card.url && (
                              <a
                                href={message.card.url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${message.card.cta ?? "View more"}: ${message.card.title}`}
                                className="mt-auto inline-flex w-fit items-center gap-1 pt-2 text-xs font-semibold text-neutral-900 transition hover:text-blue-600"
                              >
                                {message.card.cta ?? "View more"} <span aria-hidden="true">↗</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    )}

                    {message.approval && (
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void send({ approve: message.approval!.id })}
                        className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-black/10 bg-white px-3.5 py-2.5 text-left text-xs font-semibold text-neutral-900 shadow-[0_4px_16px_rgba(0,0,0,0.05)] transition hover:-translate-y-px hover:border-black/20 hover:shadow-md disabled:opacity-50"
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] text-white">✓</span>
                        <span className="min-w-0 flex-1">Approve · {message.approval.summary}</span>
                        <span className="text-neutral-300" aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-[18px] rounded-bl-[5px] bg-[#eeeeee] px-4 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" style={{ animationDelay: `${dot * 140}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-5">
        <form
          className="mx-auto flex max-w-[680px] items-end gap-2 rounded-[22px] border border-black/10 bg-white p-1.5 pl-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)] focus-within:border-black/20"
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text || sending) return;
            setInput("");
            void send({ message: text }, text);
          }}
        >
          <button type="button" aria-label="Add attachment" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-neutral-400 hover:bg-black/5 hover:text-neutral-700">+</button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            className="max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            placeholder={`Message ${bot.name}`}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-base text-white transition hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            ↑
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-neutral-400">Nomi asks before taking action on your behalf.</p>
      </div>
    </div>
  );
}
