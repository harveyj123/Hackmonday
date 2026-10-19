// The desktop Sprout, and Nomi Daily with it: a transparent, always-on-top window. Drag Sprout anywhere.
// Click to open the Daily panel beside it; on a plan's day Sprout pops a nudge on its own.
// The main process resizes this window for each view (see "pet:view" in electron/main.ts).
import { useEffect, useRef, useState } from "react";
import { Sprout, SPROUT_LINES, type PetMood } from "@/features/daily/Sprout";
import { DailyPanel, loadToday, TODAY_STORE } from "@/features/daily/DailyPanel";
import { Nudge } from "@/features/daily/Nudge";
import { addDays, loadPlans, nudgeAt, PLANS_KEY, savePlans, type Plan } from "@/features/daily/plans";
import type { StoryDay } from "@/features/daily/types";

type View = "pet" | "panel" | "nudge";
type Tab = "today" | "plans" | "days";

function moodFromDay(day?: StoryDay): PetMood {
  const segs = day?.segments ?? [];
  if (!segs.length) return "neutral";
  const fit = segs.reduce((n, s) => n + s.goalFit, 0);
  return fit > 0 ? "happy" : fit < 0 ? "worried" : "neutral";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function PetWindow() {
  const [view, setView] = useState<View>("pet");
  const [tab, setTab] = useState<Tab>("today");
  const [day, setDay] = useState<StoryDay | undefined>(() => loadToday().day);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState(false);
  const [plans, setPlansState] = useState<Plan[]>(loadPlans);
  const [nudging, setNudging] = useState<Plan | null>(null);
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
    };
    window.addEventListener("storage", onStorage);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && show("pet");
    window.addEventListener("keydown", onKey);
    const off = window.nomi?.onPetCommand((cmd) => {
      if (cmd === "open-daily") {
        setTab("today");
        show("panel");
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

  const mood: PetMood = cheer ? "celebrating" : busy ? "busy" : view === "panel" && !day ? "listening" : view === "nudge" ? "happy" : moodFromDay(day);

  const sprout = (
    <div
      role="button"
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
      <Sprout mood={mood} size={110} />
    </div>
  );

  if (view === "pet") {
    return (
      <div className="flex h-screen select-none flex-col items-center justify-end pb-2">
        <p className="mb-1 max-w-44 rounded-2xl border-2 border-stone-800 bg-white px-3 py-1.5 text-center text-xs font-medium shadow-[3px_3px_0_#292524]">
          {SPROUT_LINES[mood]}
        </p>
        {sprout}
      </div>
    );
  }

  return (
    <div className="flex h-screen select-none items-end gap-1 p-2 pr-1">
      <div className={`min-w-0 flex-1 ${view === "panel" ? "h-full" : "mb-16"}`}>
        {view === "panel" ? (
          <DailyPanel
            tab={tab}
            onTab={setTab}
            plans={plans}
            onPlans={setPlans}
            onBusy={setBusy}
            onDay={setDay}
            onBots={(item) => window.nomi?.openBots(item)}
            onPreviewNudge={nudge}
            onClose={() => show("pet")}
          />
        ) : (
          nudging && (
            <Nudge
              plan={nudging}
              onGo={() => {
                setPlans((all) => all.map((p) => (p.id === nudging.id ? { ...p, status: "done" } : p)));
                setCheer(true);
                setTimeout(() => setCheer(false), 2400);
                show("pet");
              }}
              onTomorrow={() => {
                setPlans((all) => all.map((p) => (p.id === nudging.id ? { ...p, date: addDays(p.date ?? p.from, 1), nudged: false } : p)));
                show("pet");
              }}
              onDismiss={() => show("pet")}
            />
          )
        )}
      </div>
      <div className="flex w-[124px] flex-none justify-center pb-1">{sprout}</div>
    </div>
  );
}
