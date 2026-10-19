"use client";

// The Bots window, laid out like the demo walkthrough: bots and shared memory on the left, "What do you need?" or the active conversation on the right.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatThread, type ChatSession } from "./ChatThread";
import { BOTS } from "@/data/bots";
import "./bots.css";
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

// On a Mac the window's real traffic lights sit in the sidebar's top bar; elsewhere draw the mockup's.
const NATIVE_LIGHTS = typeof navigator !== "undefined" && /Electron/.test(navigator.userAgent) && /Mac/.test(navigator.platform);

function BotAvatar({ bot, size = 2.6 }: { bot: Bot; size?: number }) {
  const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
  return <img src={meta.avatar} alt="" className="av" style={{ width: `${size}em`, height: `${size}em` }} />;
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
    ...sharedItems.filter((m) => !m.id.startsWith("daily-")).slice(-8).reverse().map((m) => ({ ...m, fresh: false })),
  ].slice(0, 12);


  function openSuggestion(sug: Suggestion) {
    openWith({ id: sug.id, botId: sug.botId, title: sug.title, context: [sug.why, sug.when, sug.where, sug.url].filter(Boolean).join(" · ") });
  }

  return (
    <div className="nb">
      <aside className="side">
        <div className="top drag">
          {NATIVE_LIGHTS ? (
            <span className="native" />
          ) : (
            <>
              <span className="light" />
              <span className="light" />
              <span className="light" />
            </>
          )}
          <button type="button" className="title" onClick={() => setView("home")} title="What do you need?">
            Nomi Bots
          </button>
          {onOpenDaily && (
            <button type="button" className="daily" aria-label="Open Nomi Daily" onClick={onOpenDaily}>
              Daily
            </button>
          )}
        </div>

        {keyWarning && <p className="warn">{keyWarning}</p>}

        <div className="rows">
          {BOTS.map((bot) => {
            const meta = BOT_META[bot.id] ?? BOT_META["career-growth"];
            const selected = view === "chat" && active.id === bot.id;
            const latest = sessions[bot.id]?.messages.filter((m) => m.text).at(-1)?.text ?? meta.preview;
            const goal = shared?.goals.find((g) => g.botId === bot.id);
            const unread = Boolean(sessions[bot.id]?.messages.length) && !selected && sessions[bot.id]?.messages.at(-1)?.role === "bot";
            const pct = goal ? Math.round(goal.progress * 100) : 0;
            return (
              <button
                key={bot.id}
                type="button"
                onClick={() => {
                  setActive(bot);
                  setPending(null);
                  setView("chat");
                }}
                className={`botrow ${selected ? "on" : ""}`}
              >
                <BotAvatar bot={bot} />
                <span className="txt">
                  <span className="name">{bot.name}</span>
                  <small>{latest}</small>
                  {goal && (
                    <span className="goal" title={`${goal.title}${goal.note ? ` · ${goal.note}` : ""}`}>
                      <i>
                        <span style={{ width: `${pct}%` }} />
                      </i>
                      <em>{pct}%</em>
                    </span>
                  )}
                </span>
                {unread && <span className="dot" />}
              </button>
            );
          })}
        </div>

        <div className="mem">
          <span className="s-lbl">Shared memory · fed by Daily</span>
          <div className="mm">
            {memoryChips.length === 0 && <span className="empty">Do a check-in in Sprout and it shows up here.</span>}
            {memoryChips.map((m) => (
              <span key={m.id} title={`${m.kind}${m.id.startsWith("daily-") ? " · from Daily" : ""}`} className={m.fresh ? "new" : ""}>
                <span className="t">{m.text}</span>
                {!m.id.startsWith("daily-") && m.kind !== "goal" && (
                  <button type="button" onClick={() => forgetMemory(m.id)} aria-label={`Forget ${m.text}`}>
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        {view === "home" ? (
          <div className="home">
            <div className="hd drag" />
            <div className="ask">
              <h6>What do you need?</h6>
              <form
                className="askbox"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRequest();
                }}
              >
                <input
                  autoFocus
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Ask for anything. Nomi picks the right bot."
                  aria-label="What do you need? Nomi sends it to the right bot"
                />
                <button type="submit" className="send" disabled={!request.trim() || routing} aria-label="Send">
                  ↑
                </button>
              </form>
              {(routing || routed) && (
                <div className="route">
                  <span>Routing</span>
                  <span className="arrow">→</span>
                  {!routed && <span className="pulse" />}
                  {routed &&
                    BOTS.map((bot) =>
                      bot.id === routed.botId ? (
                        <span key={bot.id} className="pick">
                          <BotAvatar bot={bot} size={1.6} />
                          {bot.name}
                        </span>
                      ) : (
                        <span key={bot.id} className="skip">
                          <BotAvatar bot={bot} size={1.4} />
                          {bot.name.split(" ")[0]}
                        </span>
                      ),
                    )}
                  {routed?.reason && <span className="why">{routed.reason}</span>}
                </div>
              )}
            </div>
            <div className="sugs">
              {tiles.map((tile, i) => (
                <button
                  key={tile.label}
                  type="button"
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => (tile.suggestion ? openSuggestion(tile.suggestion) : tile.ask && void submitRequest(tile.ask))}
                >
                  <b>{tile.label}</b>
                  <small>{tile.text}</small>
                </button>
              ))}
            </div>
            {suggestions.length > 1 && (
              <div className="scouted">
                <span className="s-lbl">Scouted for you</span>
                {suggestions.slice(1).map((sug, i) => {
                  const bot = BOTS.find((b) => b.id === sug.botId);
                  return (
                    <button key={sug.id} type="button" style={{ animationDelay: `${240 + i * 60}ms` }} onClick={() => openSuggestion(sug)}>
                      {bot && <BotAvatar bot={bot} size={2.2} />}
                      <span className="txt">
                        <b>{sug.title}</b>
                        <small>{[sug.when, sug.why].filter(Boolean).join(" · ")}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <ChatThread
            key={`${active.id}-${sessionEpoch}-${sessionsLoaded}-${pending?.id ?? ""}`}
            bot={active}
            handoff={pending}
            avatar={<BotAvatar bot={active} size={1.9} />}
            initialSession={sessions[active.id]}
            memories={memories}
            onSessionChange={rememberSession}
            onMemoriesLearned={rememberFacts}
            onForgetMemory={forgetMemory}
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
