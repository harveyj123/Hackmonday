// The desktop Sprout, and Nomi Daily with it: a transparent, always-on-top window. Drag Sprout anywhere.
// Click to open the Daily panel beside it; on a plan's day Sprout pops a nudge on its own.
// The main process resizes this window for each view (see "pet:view" in electron/main.ts).
import { useEffect, useRef, useState } from "react";
import { Sprout, SPROUT_LINES, type PetMood, type SproutReaction } from "@/features/daily/Sprout";
import { DailyPanel, loadToday, TODAY, TODAY_STORE } from "@/features/daily/DailyPanel";
import { Nudge } from "@/features/daily/Nudge";
import { Suggestion, type BotSuggestion, type SuggestResponse } from "@/features/daily/Suggestion";
import { dailyMemories, readSharedMemories, writeDailyMemories } from "@/features/daily/memory";
import { loadPlans, nudgeAt, planFromFind, PLANS_KEY, savePlans, type Plan } from "@/features/daily/plans";
import { addEvent, currentHealth, HEALTH_KEY, loadEvents, PLAN_DONE, PLAN_SKIPPED, type HealthEvent } from "@/features/daily/health";
import { SEED_DAYS } from "@/features/daily/seed";
import { BOTS } from "@/data/bots";
import type { StoryDay } from "@/features/daily/types";

type View = "pet" | "panel" | "nudge" | "suggest";
type Tab = "today" | "plans" | "days";

function moodFromDay(day?: StoryDay): PetMood {
  const segs = day?.segments ?? [];
  if (!segs.length) return "neutral";
  const fit = segs.reduce((n, s) => n + s.goalFit, 0);
  return fit > 0 ? "happy" : fit < 0 ? "worried" : "neutral";
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Which bot's goal a plan counts toward: the bot that found it, else a guess from the title.
function botFor(plan: Plan) {
  const found = BOTS.find((b) => b.name === plan.source || b.id === plan.source);
  if (found) return found.id;
  if (/climb|boulder|run|gym|yoga|hike/i.test(plan.title)) return "health-sports";
  if (/meetup|founder|demo|coffee chat|network/i.test(plan.title)) return "career-growth";
  return undefined;
}

export function PetWindow() {
  const [view, setView] = useState<View>("pet");
  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState<StoryDay | undefined>(() => loadToday().day);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState(false);
  const [plans, setPlansState] = useState<Plan[]>(loadPlans);
  const [nudging, setNudging] = useState<Plan | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>(loadEvents);
  const [reaction, setReaction] = useState<SproutReaction>(null);
  const [say, setSay] = useState<{ text: string; delta: number } | null>(null);
  const reactTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [suggestion, setSuggestion] = useState<BotSuggestion | null>(null);
  const pendingScout = useRef(false);
  const passed = useRef<string[]>([]);
  const viewRef = useRef<View>("pet");
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const setPlans = (fn: (p: Plan[]) => Plan[]) =>
    setPlansState((old) => {
      const next = fn(old);
      savePlans(next);
      return next;
    });

  function show(next: View) {
    window.nomi?.setPetView(next);
    setView(next);
  }

  // Ask the bots to scout one thing from shared memory, and pop it if they found something.
  async function scout() {
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        body: JSON.stringify({ memories: readSharedMemories(), skip: [...passed.current, ...plansRef.current.map((p) => p.title)] }),
      });
      if (!res.ok) return;
      const { suggestion: s } = (await res.json()) as SuggestResponse;
      if (!s || viewRef.current === "panel") return;
      setSuggestion(s);
      show("suggest");
    } catch {}
  }

  function nudge(plan: Plan) {
    setNudging(plan);
    show("nudge");
  }

  // Next upcoming plan with a day, for the demo shortcut.
  function nextPlan() {
    return [...plansRef.current]
      .filter((p) => p.status === "upcoming" && p.date)
      .sort((a, b) => (nudgeAt(a) ?? 0) - (nudgeAt(b) ?? 0))[0];
  }

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const onStorage = (e: StorageEvent) => {
      if (e.key === TODAY_STORE) setDay(loadToday().day);
      if (e.key === PLANS_KEY) setPlansState(loadPlans());
      if (e.key === HEALTH_KEY) setEvents(loadEvents());
    };
    window.addEventListener("storage", onStorage);
    // Click-through: only elements marked data-hit take the mouse; the rest of the window passes it on.
    let hit = false;
    const onMove = (e: MouseEvent) => {
      const next = Boolean(drag.current) || Boolean((e.target as Element | null)?.closest?.("[data-hit]"));
      if (next !== hit) window.nomi?.setPetHit((hit = next));
    };
    window.addEventListener("mousemove", onMove);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && show("pet");
    window.addEventListener("keydown", onKey);
    const off = window.nomi?.onPetCommand((cmd) => {
      if (cmd === "open-daily") {
        setTab("today");
        show("panel");
      } else if (cmd === "demo-suggest") {
        scout();
      } else if (cmd === "demo-nudge") {
        const p = nextPlan();
        if (p) nudge(p);
        else {
          setTab("plans");
          show("panel");
        }
      }
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      off?.();
    };
  }, []);

  // On a plan's day, at its time, Sprout speaks up once. Plans more than a day overdue stay quiet.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const due = plansRef.current.find((p) => {
        const at = nudgeAt(p);
        return p.status === "upcoming" && !p.nudged && at !== null && at <= now && now - at < DAY_MS;
      });
      if (!due) return;
      setPlans((all) => all.map((p) => (p.id === due.id ? { ...p, nudged: true } : p)));
      nudge(due);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  // Following through on a plan grows Sprout; skipping it wilts Sprout a little.
  function finishPlan(plan: Plan, done: boolean) {
    const delta = done ? PLAN_DONE : PLAN_SKIPPED;
    setPlans((all) => all.map((p) => (p.id === plan.id ? { ...p, status: done ? "done" : "skipped" } : p)));
    setEvents(addEvent({ date: plan.date ?? plan.from, delta, reason: `${done ? "Went" : "Skipped"}: ${plan.title}`, emoji: plan.emoji, kind: done ? "plan-done" : "plan-skipped" }));
    // Tell the bots, so that bot's goal bar moves too. Fine to miss if the Bots side isn't there.
    fetch("/api/memory", {
      method: "POST",
      body: JSON.stringify({ events: [{ at: new Date().toISOString(), source: "daily", kind: done ? "plan-done" : "plan-skipped", text: `${done ? "Went" : "Skipped"}: ${plan.title}`, botId: botFor(plan) }] }),
    }).catch(() => {});
    clearTimeout(reactTimer.current);
    setReaction(done ? "grow" : "wilt");
    setCheer(done);
    setSay({ text: done ? "yay! I grew a little" : "aw, I wilted a bit. next time?", delta });
    show("pet");
    reactTimer.current = setTimeout(() => {
      setReaction(null);
      setCheer(false);
      setSay(null);
    }, 3200);
  }

  const health = currentHealth([...SEED_DAYS, ...(day ? [day] : [])], events);

  // Keep Daily's part of the shared memory current, so every bot knows how the goals are going.
  useEffect(() => {
    writeDailyMemories(dailyMemories({ today: TODAY, days: [...SEED_DAYS, ...(day ? [day] : [])], plans, health }));
  }, [day, plans, health]);

  // After a check-in, once the panel closes, the bots scout something from the fresh memory.
  useEffect(() => {
    if (view === "pet" && pendingScout.current) {
      pendingScout.current = false;
      const id = setTimeout(scout, 1500);
      return () => clearTimeout(id);
    }
  }, [view]);
  const mood: PetMood = cheer ? "celebrating" : reaction === "wilt" ? "worried" : busy ? "busy" : view === "panel" && !day ? "listening" : view === "nudge" ? "happy" : moodFromDay(day);

  const sprout = (
    <div
      role="button"
      data-hit
      tabIndex={0}
      aria-label={view === "panel" ? "Close Nomi Daily (drag to move)" : "Open Nomi Daily (drag to move)"}
      title="Click for Nomi Daily, drag to move"
      className="flex-none cursor-grab active:cursor-grabbing"
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && show(view === "panel" ? "pet" : "panel")}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.screenX, y: e.screenY, moved: 0 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.screenX - d.x;
        const dy = e.screenY - d.y;
        if (!dx && !dy) return;
        d.moved += Math.abs(dx) + Math.abs(dy);
        d.x = e.screenX;
        d.y = e.screenY;
        window.nomi?.movePet(dx, dy);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved >= 5) return;
        if (view === "panel") show("pet");
        else {
          if (view === "nudge") setTab("plans");
          show("panel");
        }
      }}
    >
      <Sprout mood={mood} size={110} health={health} reaction={reaction} />
    </div>
  );

  if (view === "pet") {
    return (
      <div className="flex h-screen select-none flex-col items-center justify-end pb-2">
        <p data-hit className="relative mb-1 max-w-44 rounded-2xl border-2 border-stone-800 bg-white px-3 py-1.5 text-center text-xs font-medium shadow-[3px_3px_0_#292524]">
          {say?.text ?? SPROUT_LINES[mood]}
          {say && say.delta !== 0 && (
            <span
              className={`absolute -right-3 -top-3 animate-[popIn_.3s_ease-out] rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${say.delta > 0 ? "bg-emerald-500" : "bg-rose-400"}`}
            >
              {say.delta > 0 ? `+${say.delta}` : `−${-say.delta}`} health
            </span>
          )}
        </p>
        {sprout}
      </div>
    );
  }

  return (
    <div className="flex h-screen select-none items-end gap-1 p-2 pr-1">
      <div className={`min-w-0 flex-1 ${view === "panel" ? "h-full" : "mb-16"}`}>
        {view === "suggest" && suggestion && (
          <Suggestion
            s={suggestion}
            onAdd={() => {
              setPlans((all) => [...all.filter((p) => p.title !== suggestion.title), planFromFind(suggestion, suggestion.botName, TODAY)]);
              setSay({ text: `added! I'll remind you before ${suggestion.title}`, delta: 0 });
              clearTimeout(reactTimer.current);
              setCheer(true);
              reactTimer.current = setTimeout(() => {
                setCheer(false);
                setSay(null);
              }, 3000);
              show("pet");
            }}
            onPass={() => {
              passed.current.push(suggestion.title);
              show("pet");
            }}
          />
        )}
        {view === "suggest" ? null : view === "panel" ? (
          <DailyPanel
            tab={tab}
            onTab={setTab}
            plans={plans}
            onPlans={setPlans}
            events={events}
            health={health}
            onBusy={setBusy}
            onDay={(d) => {
              setDay(d);
              pendingScout.current = true;
            }}
            onBots={(item) => window.nomi?.openBots(item)}
            onPreviewNudge={nudge}
            onClose={() => show("pet")}
          />
        ) : (
          nudging && (
            <Nudge
              plan={nudging}
              onGo={() => finishPlan(nudging, true)}
              onSkip={() => finishPlan(nudging, false)}
              onDismiss={() => show("pet")}
            />
          )
        )}
      </div>
      <div className="flex w-[124px] flex-none justify-center pb-1">{sprout}</div>
    </div>
  );
}
