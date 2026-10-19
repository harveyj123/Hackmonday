// Sprout's bubble on the day of a plan: cheers you on, shows your free window, lets you go or push it a day.
import { useEffect, useState } from "react";
import { demoContext, freeWindow, type DayContext } from "./context";
import type { NudgeResponse, Plan } from "./plans";

// "On my way" grows Sprout; "Not today" skips the plan and Sprout wilts a little.
export function Nudge({ plan, onGo, onSkip, onDismiss }: { plan: Plan; onGo: () => void; onSkip: () => void; onDismiss: () => void }) {
  const [msg, setMsg] = useState<NudgeResponse | null>(null);
  const [calendar, setCalendar] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const date = plan.date ?? plan.from;
      const ctx = await fetch(`/api/context?date=${date}`)
        .then((r) => r.json() as Promise<DayContext>)
        .catch(() => demoContext(date));
      const cal = freeWindow(ctx.items, plan.time);
      if (!live) return;
      setCalendar(cal);
      const res = await fetch("/api/plans/nudge", { method: "POST", body: JSON.stringify({ plan, calendar: cal }) })
        .then((r) => r.json() as Promise<NudgeResponse>)
        .catch(() => ({ headline: `Today: ${plan.title} ${plan.emoji}`, message: "You put this on your list. Go enjoy it." }));
      if (live) setMsg(res);
    })();
    return () => {
      live = false;
    };
  }, [plan]);

  return (
    <div role="dialog" data-hit aria-label={`Reminder: ${plan.title}`} className="nd-float flex w-full flex-col gap-2 p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2f6b2b]">Your plan for today</p>
        <button onClick={onDismiss} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <p className="font-serif text-[22px] leading-tight">{msg ? msg.headline : `${plan.title} ${plan.emoji}`}</p>
      {msg && <p className="text-[13px] text-[#55524c]">{msg.message}</p>}
      {calendar && (
        <p className="flex items-center gap-2 text-[12px] text-[#77736c]">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[#ff3b30]" />
          Apple Calendar: {calendar.replace(/^Calendar:\s*/i, "")}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        <button onClick={onGo} className="nd-pill dark">
          On my way
        </button>
        <button onClick={onSkip} className="nd-pill">
          Not today
        </button>
      </div>
    </div>
  );
}
