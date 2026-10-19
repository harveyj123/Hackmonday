"use client";

// Conversation view in iMessage style (the demo walkthrough's scene 7) and Nomi's approval/task controls.
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
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
  onOpenDaily?: () => void;
  onNewChat?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialSession?.messages ?? (handoff ? [] : [welcomeMessage(bot)]));
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
    // A routed request gets an instant "on it", like texting a friend, while the bot searches.
    setMessages(req.handoff ? [...nextHistory, { id: crypto.randomUUID(), role: "bot", text: "ok I’m on it 👀" }] : nextHistory);
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

  const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <header className="hd drag">
        {avatar}
        <b>{bot.name}</b>
        <small>
          {sending && <span className="pulse" />}
          <button type="button" className="s" onClick={() => tasks.length && setExpanded((value) => !value)}>
            · {status}
            {tasks.length > 0 && (expanded ? " ▴" : " ▾")}
          </button>
        </small>
        <div className="tools">
          <button type="button" className={showMemory ? "on" : ""} onClick={() => setShowMemory((value) => !value)}>
            Memory{memories.length ? ` · ${memories.length}` : ""}
          </button>
          {onOpenDaily && (
            <button type="button" onClick={onOpenDaily}>
              Nomi Daily
            </button>
          )}
          {onNewChat && (
            <button type="button" className="plus" onClick={onNewChat} aria-label="New conversation" title="New conversation">
              +
            </button>
          )}
        </div>

        {showMemory && (
          <div className="pop">
            <div className="flex items-start justify-between border-b border-black/[0.06] px-4 py-3">
              <div>
                <p className="text-[0.95em] font-semibold">What Nomi remembers</p>
                <p className="mt-0.5 text-[0.75em] leading-snug text-[#8a8a8e]">Shared across all three bots. You’re always in control.</p>
              </div>
              <button type="button" onClick={() => setShowMemory(false)} aria-label="Close memory" className="ml-3 text-lg leading-none text-neutral-400 hover:text-neutral-800">
                ×
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {memories.length === 0 ? (
                <p className="px-3 py-6 text-center text-[0.8em] text-[#8a8a8e]">Nothing saved yet. Nomi remembers goals, people, places and preferences as you talk.</p>
              ) : (
                memories.map((memory) => (
                  <div key={memory.id} className="group flex items-start gap-2 rounded-xl px-3 py-2 hover:bg-neutral-50">
                    <span className="mt-0.5 rounded-full bg-[#f2f2f7] px-2 py-0.5 text-[0.6em] font-semibold uppercase tracking-wide text-[#6d6a64]">{memory.kind}</span>
                    <p className="min-w-0 flex-1 text-[0.8em] leading-relaxed">{memory.text}</p>
                    <button
                      type="button"
                      onClick={() => onForgetMemory(memory.id)}
                      aria-label={`Forget ${memory.text}`}
                      className="shrink-0 text-neutral-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </header>

      {expanded && tasks.length > 0 && (
        <div className="tasks">
          {tasks.map((task) => <TaskProgress key={task.id} task={task} />)}
        </div>
      )}

      <div ref={scroller} className="chat">
        <span className="stamp">Today · {stamp}</span>
        {tasks[0] && <MilestoneRow task={tasks[0]} />}
        {groupMessages(messages).map((group) => {
          if (group.kind === "cards") {
            const live = group.items.some((m) => m.card?.source);
            return (
              <div key={group.items[0].id} className="contents">
                {group.items.filter((m) => m.text).map((m) => (
                  <div key={`${m.id}-t`} className="bub">{m.text}</div>
                ))}
                <div className={`cards ${group.items.length > 1 ? "" : "one"}`}>
                  {group.items.map((m, i) => (
                    <EventCard key={m.id} index={i} message={m} disabled={sending} done={Boolean(m.approval && approved.includes(m.approval.id))} onApprove={(id) => void send({ approve: id })} />
                  ))}
                </div>
                {live && <span className="src">Found with Parallel Search on the live web</span>}
              </div>
            );
          }
          const message = group.items[0];
          return (
            <div key={message.id} className="contents">
              {message.text && <div className={`bub ${message.role === "user" ? "me" : ""}`}>{message.text}</div>}
              {message.approval && (
                <button type="button" className="approve-inline" disabled={sending} onClick={() => void send({ approve: message.approval!.id })}>
                  Approve · {message.approval.summary}
                </button>
              )}
            </div>
          );
        })}
        {sending && (
          <div className="bub typing" aria-label="typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <div className="composer">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const text = input.trim();
            if (!text || sending) return;
            setInput("");
            void send({ message: text }, text);
          }}
        >
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
            placeholder={`Message ${bot.name}`}
          />
          <button type="submit" className="send" disabled={!input.trim() || sending} aria-label="Send message">
            ↑
          </button>
        </form>
        <p>Nomi asks before taking action on your behalf.</p>
      </div>
    </>
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

const BANDS = ["b", "", "c"];

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

function EventCard({ message, index, disabled, done, onApprove }: { message: ChatMessage; index: number; disabled: boolean; done: boolean; onApprove: (id: string) => void }) {
  const card = message.card!;
  const tag = card.source ?? siteName(card.url) ?? card.eyebrow;
  return (
    <article className="ev">
      <div className={`img ${BANDS[index % BANDS.length]}`} style={card.imageUrl ? { backgroundImage: `url(${card.imageUrl})` } : undefined}>
        {tag && <em>{tag}</em>}
      </div>
      <div className="tx">
        <b>{card.title}</b>
        {card.subtitle && <small>{card.subtitle}</small>}
        {card.host && <small>Hosted by {card.host}</small>}
        {card.why && <small className="why">{card.why}</small>}
      </div>
      <div className="acts">
        {message.approval && (
          <button type="button" className={`ok ${done ? "done" : ""}`} disabled={disabled || done} onClick={() => onApprove(message.approval!.id)} title={message.approval.summary}>
            {done ? (message.approval.kind === "calendar_hold" ? "Added ✓" : "Done ✓") : "Approve"}
          </button>
        )}
        {card.url && (
          <a href={card.url} target="_blank" rel="noreferrer">
            {card.cta ?? "View more"}
          </a>
        )}
      </div>
    </article>
  );
}

function MilestoneRow({ task }: { task: BotTask }) {
  return (
    <div className="ms" aria-label={task.title}>
      {task.milestones.map((m, i) => (
        <Fragment key={m.label}>
          <span className={m.status === "done" ? "d" : m.status === "active" ? "c" : ""}>
            <i />
            {m.label}
          </span>
          {i < task.milestones.length - 1 && <hr className={m.status === "done" ? "d" : ""} />}
        </Fragment>
      ))}
    </div>
  );
}
