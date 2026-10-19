"use client";

// Grok-style bot inbox: agents on the left, the active conversation on the right.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatThread, type ChatSession } from "./ChatThread";
import { BOTS } from "@/data/bots";
import type { ActionItem, Bot, MemoryCandidate, NomiMemory } from "@/lib/types";

const CONVERSATION_STORAGE_KEY = "nomi-agent-conversations-v6";
const MEMORY_STORAGE_KEY = "nomi-shared-memory-v4";

const BOT_META: Record<string, { avatar: string; preview: string; time: string; unread?: boolean }> = {
  "career-growth": {
    avatar: "/mascots/career-growth.png",
    preview: "Let’s shape the world around your next move",
    time: "Now",
  },
  "health-sports": {
    avatar: "/mascots/health-sports.png",
    preview: "Let’s make the healthy choice the easy choice",
    time: "Now",
  },
  "social-hobbies": {
    avatar: "/mascots/social-hobbies.png",
    preview: "Let’s build a social world that fits you",
    time: "Now",
  },
};

function BotAvatar({ bot, small = false }: { bot: Bot; small?: boolean }) {
  const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[38%] border border-black/[0.07] bg-[#f7f1e7] shadow-sm ${
        small ? "h-8 w-8" : "h-11 w-11"
      }`}
    >
      <img src={meta.avatar} alt={`${bot.name} mascot`} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

export function BotsView({
  handoff,
  onHandoffConsumed,
  onOpenDaily,
}: {
  handoff: ActionItem | null;
  onHandoffConsumed: () => void;
  onOpenDaily: () => void;
}) {
  const [active, setActive] = useState<Bot>(BOTS.find((bot) => bot.live) ?? BOTS[0]);
  const [pending, setPending] = useState<ActionItem | null>(null);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [memories, setMemories] = useState<NomiMemory[]>([]);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const visibleBots = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return BOTS;
    return BOTS.filter((bot) => `${bot.name} ${bot.tagline}`.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    if (!handoff) return;
    const next = BOTS.find((bot) => bot.id === handoff.botId);
    if (next) setActive(next);
    setPending(handoff);
    setShowList(false);
    onHandoffConsumed();
  }, [handoff, onHandoffConsumed]);

  useEffect(() => {
    try {
      // One-time full reset requested for this build.
      window.localStorage.removeItem("nomi-agent-conversations-v2");
      window.localStorage.removeItem("nomi-agent-conversations-v3");
      window.localStorage.removeItem("nomi-agent-conversations-v4");
      window.localStorage.removeItem("nomi-agent-conversations-v5");
      window.localStorage.removeItem("nomi-shared-memory-v1");
      window.localStorage.removeItem("nomi-shared-memory-v2");
      window.localStorage.removeItem("nomi-shared-memory-v3");
      const saved = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (saved) setSessions(JSON.parse(saved) as Record<string, ChatSession>);
      const savedMemories = window.localStorage.getItem(MEMORY_STORAGE_KEY);
      if (savedMemories) setMemories(JSON.parse(savedMemories) as NomiMemory[]);
    } catch {
      // A corrupt local cache should never stop the agents from opening.
    } finally {
      setSessionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionsLoaded) return;
    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, sessionsLoaded]);

  useEffect(() => {
    if (!sessionsLoaded) return;
    window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
  }, [memories, sessionsLoaded]);

  const rememberSession = useCallback((session: ChatSession) => {
    setSessions((current) => ({ ...current, [active.id]: session }));
  }, [active.id]);

  const rememberFacts = useCallback((learned: MemoryCandidate[]) => {
    if (!learned.length) return;
    setMemories((current) => {
      const next = [...current];
      for (const candidate of learned) {
        const text = candidate.text.trim();
        if (!text || next.some((memory) => memory.kind === candidate.kind && memory.text.toLowerCase() === text.toLowerCase())) continue;
        next.push({ ...candidate, text, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      }
      return next.slice(-40);
    });
  }, []);

  const forgetMemory = useCallback((id: string) => {
    setMemories((current) => current.filter((memory) => memory.id !== id));
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100dvh-2rem)] min-h-[620px] w-full max-w-[1180px] overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
      <aside
        className={`${showList ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-black/8 bg-[#f7f7f7] min-[500px]:flex min-[500px]:w-[230px] md:w-[320px] lg:w-[340px]`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-black/5 px-5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <p className="ml-3 text-sm font-semibold tracking-tight text-neutral-900">Nomi Bots</p>
          <button
            type="button"
            aria-label="Open Nomi Daily"
            onClick={onOpenDaily}
            className="ml-auto rounded-full px-2.5 py-1 text-xs font-medium text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
          >
            Daily
          </button>
          <button
            type="button"
            aria-label="New conversation"
            title="New conversation"
            onClick={() => {
              setSessions((current) => {
                const next = { ...current };
                delete next[active.id];
                return next;
              });
              setPending(null);
              setSessionEpoch((value) => value + 1);
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-xl font-light text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
          >
            +
          </button>
        </div>

        <div className="px-3 pb-2 pt-3">
          <label className="flex h-10 items-center gap-2 rounded-xl bg-black/[0.055] px-3 text-neutral-400 ring-1 ring-inset ring-black/[0.04] focus-within:bg-white focus-within:ring-black/10">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-2">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search bots"
              className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <span className="rounded border border-black/10 bg-white px-1.5 py-0.5 text-[10px] text-neutral-400">⌘K</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {visibleBots.map((bot) => {
            const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
            const selected = active.id === bot.id;
            const latest = sessions[bot.id]?.messages.at(-1)?.text ?? meta.preview;
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => {
                  if (!bot.live) return;
                  setActive(bot);
                  setPending(null);
                  setShowList(false);
                }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  selected ? "bg-[#e8e8e8]" : "hover:bg-black/[0.035]"
                } ${!bot.live ? "cursor-default" : ""}`}
              >
                <BotAvatar bot={bot} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate text-[14px] font-semibold ${bot.live ? "text-neutral-900" : "text-neutral-500"}`}>
                      {bot.name}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{meta.time}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-xs text-neutral-500">{latest}</span>
                    {meta.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                  </span>
                </span>
              </button>
            );
          })}

          {visibleBots.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-400">No bots found</p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-black/5 px-5 py-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-950 text-xs font-semibold text-white">H</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-neutral-900">Harvey</p>
            <p className="truncate text-[11px] text-neutral-400">Your environment, on purpose</p>
          </div>
          <button aria-label="Settings" className="ml-auto text-lg text-neutral-400 hover:text-neutral-700">···</button>
        </div>
      </aside>

      <main className={`${showList ? "hidden" : "flex"} min-w-0 flex-1 min-[500px]:flex`}>
        <ChatThread
          key={`${active.id}-${sessionEpoch}-${sessionsLoaded}`}
          bot={active}
          handoff={pending}
          avatar={<BotAvatar bot={active} small />}
          initialSession={sessions[active.id]}
          memories={memories}
          onSessionChange={rememberSession}
          onMemoriesLearned={rememberFacts}
          onForgetMemory={forgetMemory}
          onBack={() => setShowList(true)}
          onOpenDaily={onOpenDaily}
        />
      </main>
    </div>
  );
}
