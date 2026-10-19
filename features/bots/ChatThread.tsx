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
  if (/event|activit|host|sign.?up|ticket/.test(text)) return "searching Luma, Meetup, Partiful…";
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
  onNewChat,
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
  onNewChat?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession?.messages ?? [welcomeMessage(bot)]);
  const [tasks, setTasks] = useState<BotTask[]>(initialSession?.tasks ?? []);
  const [status, setStatus] = useState(initialSession?.status ?? "Ready when you are");
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
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
      if (req.approve) {
        setApproved((current) => [...current, req.approve!]);
        // Approve goes straight to Apple Calendar: open the .ics the bot just made.
        const ics = data.messages.find((m) => m.card?.url?.startsWith("/api/ics"))?.card?.url;
        if (ics) window.open(ics);
      }
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
      <header className="relative flex h-12 shrink-0 items-center border-b border-[#ececec] px-4 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          className="mr-3 grid h-8 w-8 place-items-center rounded-full text-xl text-neutral-500 hover:bg-black/5 min-[500px]:hidden"
          aria-label="Back to bots"
        >
          ‹
        </button>
        {avatar}
        <div className="ml-2.5 flex min-w-0 items-baseline gap-1.5">
          <p className="shrink-0 text-[13px] font-semibold text-neutral-900">{bot.name}</p>
          <button
            type="button"
            onClick={() => tasks.length && setExpanded((value) => !value)}
            className={`flex min-w-0 items-center gap-1 truncate text-[12px] ${sending ? "text-[#2f5fd0]" : "text-[#8a8a8e]"}`}
          >
            {sending && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#2f5fd0]" />}
            <span className="truncate">· {status}</span>
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
          {onNewChat && (
            <button type="button" onClick={onNewChat} aria-label="New conversation" title="New conversation" className="grid h-8 w-8 place-items-center rounded-full text-lg text-neutral-400 hover:bg-black/5 hover:text-neutral-800">
              +
            </button>
          )}
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
          {tasks[0] && <MilestoneRow task={tasks[0]} />}
          <div className="space-y-2">
            {groupMessages(messages).map((group) => {
              if (group.kind === "cards") {
                const live = group.items.some((m) => m.card?.source);
                return (
                  <div key={group.items[0].id} className="space-y-1.5">
                    {group.items.filter((m) => m.text).map((m) => (
                      <div key={`${m.id}-t`} className="flex justify-start">
                        <div className="max-w-[78%] rounded-[18px] bg-[#e9e9eb] px-3.5 py-2 text-[14px] leading-[1.4] text-neutral-900">{m.text}</div>
                      </div>
                    ))}
                    <div className={`grid gap-2.5 ${group.items.length > 1 ? "sm:grid-cols-2" : "max-w-[420px]"}`}>
                      {group.items.map((m) => (
                        <EventCard key={m.id} message={m} disabled={sending} done={Boolean(m.approval && approved.includes(m.approval.id))} onApprove={(id) => void send({ approve: id })} />
                      ))}
                    </div>
                    {live && <p className="text-[11px] text-[#8a8a8e]">Found with Parallel Search on the live web</p>}
                  </div>
                );
              }
              const message = group.items[0];
              const isUser = message.role === "user";
              return (
                <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[78%]">
                    {message.text && (
                      <div className={`rounded-[18px] px-3.5 py-2 text-[14px] leading-[1.4] ${isUser ? "bg-[#0a84ff] text-white" : "bg-[#e9e9eb] text-neutral-900"}`}>
                        <p className="whitespace-pre-wrap">{message.text}</p>
                      </div>
                    )}
                    {message.approval && (
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void send({ approve: message.approval!.id })}
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#34c759] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                      >
                        Approve · {message.approval.summary}
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

type Group = { kind: "cards" | "single"; items: ChatMessage[] };

// Consecutive bot messages with cards sit side by side, like the mockup's two event cards.
function groupMessages(messages: ChatMessage[]): Group[] {
  const out: Group[] = [];
  for (const m of messages) {
    const last = out.at(-1);
    if (m.role === "bot" && m.card) {
      // Text-less live cards line up side by side; a card that comes with its own text starts a new row.
      if (last?.kind === "cards" && !m.text) last.items.push(m);
      else out.push({ kind: "cards", items: [m] });
    } else out.push({ kind: "single", items: [m] });
  }
  return out;
}

const BANDS = [
  "linear-gradient(135deg,#12343b,#2c7873 55%,#e1b382)",
  "linear-gradient(135deg,#2d2b55,#6a4fb5 55%,#f08a5d)",
  "linear-gradient(135deg,#3d6b4a,#9cc98a)",
];

function siteName(url?: string) {
  if (!url) return undefined;
  try {
    const host = new URL(url, "https://x").hostname.replace(/^www\./, "");
    const known: Record<string, string> = { "lu.ma": "Luma", "luma.com": "Luma", "meetup.com": "Meetup", "partiful.com": "Partiful", "eventbrite.com": "Eventbrite" };
    return known[host] ?? (host === "x" || host.includes("google.") ? undefined : host);
  } catch {
    return undefined;
  }
}

function EventCard({ message, disabled, done, onApprove }: { message: ChatMessage; disabled: boolean; done: boolean; onApprove: (id: string) => void }) {
  const card = message.card!;
  const tag = card.source ?? siteName(card.url) ?? card.eyebrow;
  const band = BANDS[(card.title.length + (card.subtitle?.length ?? 0)) % BANDS.length];
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#e5e5ea] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <div className="relative h-16 bg-cover bg-center" style={{ backgroundImage: card.imageUrl ? `url(${card.imageUrl})` : band }}>
        {tag && <span className="absolute bottom-1.5 left-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold capitalize text-white">{tag}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 pb-2 pt-2.5">
        <p className="text-[14px] font-semibold leading-snug text-neutral-900">{card.title}</p>
        {card.subtitle && <p className="line-clamp-2 text-[12px] text-[#6d6d72]">{card.subtitle}</p>}
        {card.host && <p className="text-[12px] text-[#6d6d72]">Hosted by {card.host}</p>}
        {card.why && <p className="mt-0.5 line-clamp-2 text-[12px] text-[#2f6b2b]">{card.why}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
        {message.approval && (
          <button
            type="button"
            disabled={disabled || done}
            onClick={() => onApprove(message.approval!.id)}
            title={message.approval.summary}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold text-white transition hover:brightness-95 ${done ? "bg-neutral-900" : "bg-[#34c759] disabled:opacity-50"}`}
          >
            {done ? (message.approval.kind === "calendar_hold" ? "Added ✓" : "Done ✓") : "Approve"}
          </button>
        )}
        {card.url && (
          <a href={card.url} target="_blank" rel="noreferrer" className="rounded-full bg-[#f2f2f7] px-3 py-1 text-[12px] text-neutral-900 transition hover:bg-[#e5e5ea]">
            {card.cta ?? "View more"}
          </a>
        )}
      </div>
    </article>
  );
}

function MilestoneRow({ task }: { task: BotTask }) {
  return (
    <div className="mb-4 flex items-start text-[10px] text-[#8a8a8e]" aria-label={task.title}>
      {task.milestones.map((m, i) => (
        <div key={m.label} className="flex flex-1 items-start last:flex-none">
          <span className="flex shrink-0 flex-col items-center gap-1">
            <i className={`block h-3 w-3 rounded-full ${m.status === "done" ? "bg-[#34c759]" : m.status === "active" ? "animate-pulse bg-[#0a84ff]" : "bg-[#d1d1d6]"}`} />
            <span className={m.status === "active" ? "font-medium text-[#0a84ff]" : ""}>{m.label}</span>
          </span>
          {i < task.milestones.length - 1 && <hr className={`mx-1 mt-[5px] h-[2px] flex-1 border-0 ${m.status === "done" ? "bg-[#34c759]" : "bg-[#e5e5ea]"}`} />}
        </div>
      ))}
    </div>
  );
}
