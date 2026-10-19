"use client";

// Grok-style bot inbox: agents on the left, the active conversation on the right.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatThread, type ChatSession } from "./ChatThread";
import { BOTS } from "@/data/bots";
import type { ActionItem, Bot, BotId, NomiMemory, RouteResponse, SharedMemory, Suggestion, SuggestionsResponse } from "@/lib/types";

const CONVERSATION_STORAGE_KEY = "nomi-agent-conversations-v6";
const DAILY_MEMORY_KEY = "nomi-shared-memory-v4"; // features/daily/memory.ts on #7

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

function BotAvatar({ bot, small = false, tiny = false }: { bot: Bot; small?: boolean; tiny?: boolean }) {
  const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[38%] border border-black/[0.07] bg-[#f7f1e7] shadow-sm ${
        tiny ? "h-4 w-4" : small ? "h-8 w-8" : "h-11 w-11"
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
  onOpenDaily?: () => void;
}) {
  const [active, setActive] = useState<Bot>(BOTS.find((bot) => bot.live) ?? BOTS[0]);
  const [pending, setPending] = useState<ActionItem | null>(null);
  const [request, setRequest] = useState("");
  const [routing, setRouting] = useState(false);
  const [routed, setRouted] = useState<RouteResponse | null>(null);
  const [shared, setShared] = useState<SharedMemory | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [keyWarning, setKeyWarning] = useState("");

  useEffect(() => {
    fetch("/api/bots/status")
      .then((res) => res.json() as Promise<{ model: boolean; parallel: boolean; malformed: string[] }>)
      .then((s) => {
        if (s.malformed.length) setKeyWarning(`${s.malformed.join(" and ")} has a stray character. Paste it again in .env.local and restart.`);
        else if (!s.model || !s.parallel) setKeyWarning(`Demo mode: add ${[!s.model && "CLINE_API_KEY", !s.parallel && "PARALLEL_API_KEY"].filter(Boolean).join(" and ")} to .env.local for live results.`);
      })
      .catch(() => undefined);
  }, []);
  const [showList, setShowList] = useState(true);
  const [sessions, setSessions] = useState<Record<string, ChatSession>>({});
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const visibleBots = BOTS;
  const memories = useMemo(() => shared?.items ?? [], [shared]);

  // The shared memory lives in the main process; Daily writes to it from Sprout, so re-read on focus.
  const refreshMemory = useCallback(async () => {
    try {
      setShared((await (await fetch("/api/memory")).json()) as SharedMemory);
    } catch {
      // Keep the last copy.
    }
  }, []);

  useEffect(() => {
    void refreshMemory();
    window.addEventListener("focus", refreshMemory);
    return () => window.removeEventListener("focus", refreshMemory);
  }, [refreshMemory]);

  // Daily (in Sprout) also writes its entries to localStorage; mirror them into the shared store.
  useEffect(() => {
    const sync = () => {
      try {
        const all = JSON.parse(window.localStorage.getItem(DAILY_MEMORY_KEY) ?? "[]") as NomiMemory[];
        // Send the full set, even when empty, so Daily's "start over" clears it here too.
        const daily = all.filter((m) => m.id?.startsWith("daily-"));
        void fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ daily }) })
          .then((res) => res.json() as Promise<SharedMemory>)
          .then(setShared);
      } catch {
        // Nothing from Daily yet.
      }
    };
    sync();
    const onStorage = (e: StorageEvent) => e.key === DAILY_MEMORY_KEY && sync();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Bots scout proactively from that memory.
  const memoryStamp = shared?.updatedAt;
  useEffect(() => {
    if (!memoryStamp) return;
    fetch("/api/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 3 }) })
      .then((res) => res.json() as Promise<SuggestionsResponse>)
      .then((data) => setSuggestions(data.suggestions))
      .catch(() => undefined);
    // Re-scout when the goals change, not on every chat fact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryStamp?.slice(0, 15)]);

  function openWith(item: ActionItem) {
    const next = BOTS.find((bot) => bot.id === item.botId);
    if (next) setActive(next);
    setPending(item);
    setShowList(false);
  }

  async function submitRequest() {
    const text = request.trim();
    if (!text || routing) return;
    setRouting(true);
    try {
      const res = await fetch("/api/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const route = (await res.json()) as RouteResponse;
      setRouted(route);
      setRequest("");
      void fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [{ source: "user", kind: "request", text, botId: route.botId }] }),
      });
      openWith({ id: crypto.randomUUID(), botId: route.botId as BotId, title: text, context: "Scout real options for this request and pick the best fit." });
    } finally {
      setRouting(false);
    }
  }

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


  const rememberSession = useCallback((session: ChatSession) => {
    setSessions((current) => ({ ...current, [active.id]: session }));
  }, [active.id]);

  // The agent already saved what it learned in the main process; just re-read.
  const rememberFacts = useCallback(() => {
    void refreshMemory();
  }, [refreshMemory]);

  const forgetMemory = useCallback((id: string) => {
    void fetch("/api/memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ forget: id }) })
      .then((res) => res.json() as Promise<SharedMemory>)
      .then(setShared)
      .catch(() => undefined);
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
          {onOpenDaily && <button
            type="button"
            aria-label="Open Nomi Daily"
            onClick={onOpenDaily}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
          >
            Daily
          </button>}
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
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-xl font-light text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
          >
            +
          </button>
        </div>

        {keyWarning && (
          <p className="mx-3 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-200">{keyWarning}</p>
        )}
        <form
          className="px-3 pb-2 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRequest();
          }}
        >
          <label className="flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-neutral-400 shadow-sm ring-1 ring-inset ring-black/[0.08] focus-within:ring-black/20">
            <span aria-hidden="true" className="text-sm">✨</span>
            <input
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="What do you need?"
              aria-label="What do you need? Nomi sends it to the right bot"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            <button
              type="submit"
              disabled={!request.trim() || routing}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {routing ? "…" : "Ask"}
            </button>
          </label>
          {routed && (
            <p className="mt-1.5 truncate px-1 text-[11px] text-neutral-400">
              Sent to <span className="font-medium text-neutral-600">{BOTS.find((b) => b.id === routed.botId)?.name}</span>
              {routed.reason ? ` · ${routed.reason}` : ""}
            </p>
          )}
        </form>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {visibleBots.map((bot) => {
            const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
            const selected = active.id === bot.id;
            const latest = sessions[bot.id]?.messages.at(-1)?.text ?? meta.preview;
            const goal = shared?.goals.find((g) => g.botId === bot.id);
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
                  {goal && (
                    <span className="mt-1.5 flex items-center gap-2" title={`${goal.title}${goal.note ? ` · ${goal.note}` : ""}`}>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                        <span className="block h-full rounded-full bg-neutral-800 transition-all" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">{Math.round(goal.progress * 100)}%</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {suggestions.length > 0 && (
            <div className="mt-3 px-1">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Scouted for you</p>
              <div className="space-y-1.5">
                {suggestions.map((sug) => {
                  const bot = BOTS.find((b) => b.id === sug.botId);
                  return (
                    <button
                      key={sug.id}
                      type="button"
                      onClick={() =>
                        openWith({
                          id: sug.id,
                          botId: sug.botId,
                          title: sug.title,
                          context: [sug.why, sug.when, sug.where, sug.url].filter(Boolean).join(" · "),
                        })
                      }
                      className="block w-full rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-black/15"
                    >
                      <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                        {bot && <BotAvatar bot={bot} tiny />}
                        {bot?.name}
                        {sug.when && <span className="ml-auto truncate">{sug.when}</span>}
                      </span>
                      <span className="mt-1 block truncate text-[13px] font-semibold text-neutral-900">{sug.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-neutral-500">{sug.why}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
