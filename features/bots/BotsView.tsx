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
  const [view, setView] = useState<"home" | "chat">("home");
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
      .then((data) => setSuggestions(data.suggestions.filter((sug, i, all) => all.findIndex((x) => x.title === sug.title) === i)))
      .catch(() => undefined);
    // Re-scout when the goals change, not on every chat fact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryStamp?.slice(0, 15)]);

  function openWith(item: ActionItem) {
    const next = BOTS.find((bot) => bot.id === item.botId);
    if (next) setActive(next);
    setPending(item);
    setShowList(false);
    setView("chat");
  }

  // The home view's four tiles come straight from the shared memory and the bots' scouting.
  const tiles = useMemo(() => {
    const items = shared?.items ?? [];
    const daily = items.filter((m) => m.id.startsWith("daily-"));
    const person = [...daily, ...items].find((m) => m.kind === "person");
    const behind = [...(shared?.goals ?? [])].sort((a, b) => a.progress - b.progress)[0];
    const planned = [...daily, ...items].find((m) => m.kind === "commitment");
    const next = suggestions[0];
    return [
      person && { label: "From today", text: person.text, ask: `More rooms with people like this: ${person.text}` },
      behind && { label: "Goal", text: `${behind.title}. ${behind.note ?? `${Math.round(behind.progress * 100)}% there`}`, ask: `Help me with my goal: ${behind.title}` },
      planned && { label: "Planned", text: planned.text, ask: `Prep me for: ${planned.text}` },
      next && { label: "Next", text: `${next.title}${next.when ? ` · ${next.when}` : ""}`, suggestion: next },
    ].filter(Boolean) as { label: string; text: string; ask?: string; suggestion?: Suggestion }[];
  }, [shared, suggestions]);

  async function submitRequest(preset?: string) {
    const text = (preset ?? request).trim();
    if (!text || routing) return;
    setRequest(text);
    setRouting(true);
    try {
      const res = await fetch("/api/route", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const route = (await res.json()) as RouteResponse;
      setRouted(route);
      // Let the routing line land on screen before the bot's thread opens.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      setRequest("");
      setRouted(null);
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
    setView("chat");
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

  const sharedItems = shared?.items ?? [];
  const memoryChips = [
    ...sharedItems.filter((m) => m.id.startsWith("daily-")).map((m) => ({ ...m, fresh: true })),
    ...(shared?.goals ?? []).map((g) => ({ id: g.id, kind: "goal" as const, text: `${g.title}: ${Math.round(g.progress * 100)}%`, createdAt: g.updatedAt, fresh: false })),
    ...sharedItems.filter((m) => !m.id.startsWith("daily-")).slice(-8).reverse().map((m) => ({ ...m, fresh: Date.now() - new Date(m.createdAt).getTime() < 3600_000 })),
  ].slice(0, 12);

  return (
    <div className="mx-auto flex h-[calc(100dvh-2rem)] min-h-[620px] w-full max-w-[1180px] overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
      <aside
        className={`${showList ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-[#ebebeb] bg-[#f7f7f7] min-[500px]:flex min-[500px]:w-[260px] md:w-[300px] lg:w-[320px]`}
      >
        <div className="flex h-12 items-center gap-2 border-b border-[#ececec] px-4">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <button
            type="button"
            onClick={() => {
              setView("home");
              setShowList(false);
            }}
            className="ml-2 text-[13px] font-semibold tracking-tight text-neutral-900"
            title="What do you need?"
          >
            Nomi Bots
          </button>
          {onOpenDaily && (
            <button
              type="button"
              aria-label="Open Nomi Daily"
              onClick={onOpenDaily}
              className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
            >
              Daily
            </button>
          )}
        </div>

        {keyWarning && (
          <p className="mx-3 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-200">{keyWarning}</p>
        )}

        <div className="overflow-y-auto">
          {visibleBots.map((bot) => {
            const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
            const selected = view === "chat" && active.id === bot.id;
            const latest = sessions[bot.id]?.messages.filter((m) => m.text).at(-1)?.text ?? meta.preview;
            const goal = shared?.goals.find((g) => g.botId === bot.id);
            const unread = Boolean(sessions[bot.id]?.messages.length) && !selected && sessions[bot.id]?.messages.at(-1)?.role === "bot";
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => {
                  setActive(bot);
                  setPending(null);
                  setShowList(false);
                  setView("chat");
                }}
                className={`flex w-full items-center gap-3 border-b border-[#efefef] px-4 py-3 text-left transition ${selected ? "bg-[#e9e9eb]" : "hover:bg-black/[0.03]"}`}
              >
                <BotAvatar bot={bot} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-neutral-900">{bot.name}</span>
                    {unread && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[#0a84ff]" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#8a8a8e]">{latest}</span>
                  {goal && (
                    <span className="mt-1.5 flex items-center gap-2" title={`${goal.title}${goal.note ? ` · ${goal.note}` : ""}`}>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                        <span className="block h-full rounded-full bg-[#4f9a4a] transition-all duration-700" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-[#8a8a8e]">{Math.round(goal.progress * 100)}%</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-auto border-t border-[#ececec] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b877f]">Shared memory · fed by Daily</p>
          <div className="mt-2 flex max-h-[148px] flex-wrap gap-1 overflow-y-auto">
            {memoryChips.length === 0 && <span className="text-[11px] text-neutral-400">Do a check-in in Sprout and it shows up here.</span>}
            {memoryChips.map((m) => (
              <span
                key={m.id}
                title={`${m.kind}${m.id.startsWith("daily-") ? " · from Daily" : ""}`}
                className={`group inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] ${m.fresh ? "border-[#cfe5c3] bg-[#e7f2df] text-[#2f6b2b]" : "border-[#e3e3e3] bg-white text-[#3b3a36]"}`}
              >
                <span className="truncate">{m.text}</span>
                {!m.id.startsWith("daily-") && m.kind !== "goal" && (
                  <button type="button" onClick={() => forgetMemory(m.id)} aria-label={`Forget ${m.text}`} className="hidden text-neutral-400 hover:text-red-500 group-hover:inline">×</button>
                )}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className={`${showList ? "hidden" : "flex"} min-w-0 flex-1 flex-col min-[500px]:flex`}>
        {view === "home" ? (
          <div className="flex-1 overflow-y-auto">
            <button type="button" onClick={() => setShowList(true)} className="m-3 text-sm text-neutral-500 min-[500px]:hidden">‹ Bots</button>
            <div className="mx-auto flex max-w-[640px] flex-col gap-3 px-6 pt-10 sm:pt-16">
              <h2 className="font-serif text-[34px] leading-tight text-neutral-900">What do you need?</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRequest();
                }}
                className="flex items-center gap-2 rounded-full border-2 border-neutral-900 bg-white py-1.5 pl-5 pr-1.5"
              >
                <input
                  autoFocus
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Ask for anything. Nomi picks the right bot."
                  aria-label="What do you need? Nomi sends it to the right bot"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-neutral-900 outline-none placeholder:text-[#8a8a8e]"
                />
                <button
                  type="submit"
                  disabled={!request.trim() || routing}
                  aria-label="Send"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0a84ff] text-white transition disabled:bg-neutral-200"
                >
                  ↑
                </button>
              </form>
              {(routing || routed) && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#55524c]">
                  <span>Routing</span>
                  <span className="text-[#8a8a8e]">→</span>
                  {!routed && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0a84ff]" />}
                  {routed &&
                    BOTS.map((bot) =>
                      bot.id === routed.botId ? (
                        <span key={bot.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#f6cdb9] bg-[#fff1ea] py-0.5 pl-0.5 pr-2.5 font-semibold text-[#a8401c]">
                          <BotAvatar bot={bot} tiny />
                          {bot.name}
                        </span>
                      ) : (
                        <span key={bot.id} className="inline-flex items-center gap-1 opacity-45">
                          <BotAvatar bot={bot} tiny />
                          {bot.name.split(" ")[0]}
                        </span>
                      ),
                    )}
                  {routed?.reason && <span className="w-full text-[12px] text-[#8a8a8e]">{routed.reason}</span>}
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {tiles.map((tile) => (
                  <button
                    key={tile.label}
                    type="button"
                    onClick={() =>
                      tile.suggestion
                        ? openWith({
                            id: tile.suggestion.id,
                            botId: tile.suggestion.botId,
                            title: tile.suggestion.title,
                            context: [tile.suggestion.why, tile.suggestion.when, tile.suggestion.where, tile.suggestion.url].filter(Boolean).join(" · "),
                          })
                        : tile.ask && void submitRequest(tile.ask)
                    }
                    className="flex flex-col gap-0.5 rounded-xl border border-[#ececec] px-3.5 py-3 text-left transition hover:border-black/20"
                  >
                    <span className="text-[13px] font-semibold text-neutral-900">{tile.label}</span>
                    <span className="line-clamp-2 text-[12px] leading-snug text-[#8a8a8e]">{tile.text}</span>
                  </button>
                ))}
              </div>
              {suggestions.length > 1 && (
                <div className="mt-4">
                  <p className="pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8b877f]">Scouted for you</p>
                  <div className="space-y-2">
                    {suggestions.slice(1).map((sug) => {
                      const bot = BOTS.find((b) => b.id === sug.botId);
                      return (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => openWith({ id: sug.id, botId: sug.botId, title: sug.title, context: [sug.why, sug.when, sug.where, sug.url].filter(Boolean).join(" · ") })}
                          className="flex w-full items-center gap-3 rounded-xl border border-[#ececec] px-3 py-2.5 text-left transition hover:border-black/20"
                        >
                          {bot && <BotAvatar bot={bot} small />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-neutral-900">{sug.title}</span>
                            <span className="block truncate text-[12px] text-[#8a8a8e]">{[sug.when, sug.why].filter(Boolean).join(" · ")}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ChatThread
            key={`${active.id}-${sessionEpoch}-${sessionsLoaded}-${pending?.id ?? ""}`}
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
            onNewChat={() => {
              setSessions((current) => {
                const next = { ...current };
                delete next[active.id];
                return next;
              });
              setPending(null);
              setSessionEpoch((value) => value + 1);
            }}
          />
        )}
      </main>
    </div>
  );
}
