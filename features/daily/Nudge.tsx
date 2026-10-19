// Sprout's bubble on the day of a plan: cheers you on, shows your free window, lets you go or push it a day.
import { useEffect, useState } from "react";
import { demoContext, freeWindow, type DayContext } from "./context";
import type { NudgeResponse, Plan } from "./plans";

export function Nudge({ plan, onGo, onTomorrow, onDismiss }: { plan: Plan; onGo: () => void; onTomorrow: () => void; onDismiss: () => void }) {
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
    <div
      role="dialog"
      data-hit
      aria-label={`Reminder: ${plan.title}`}
      className="w-full rounded-[20px] rounded-br-md border-2 border-stone-900 bg-white p-4 shadow-[4px_4px_0_#1c1917] animate-[popIn_.28s_cubic-bezier(.2,.9,.25,1.15)] [transform-origin:100%_100%]"
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">Your plan for today</p>
        <button onClick={onDismiss} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Dismiss">
          ✕
        </button>
      </div>
      {msg ? (
        <>
          <p className="mt-1 font-serif text-xl leading-snug">{msg.headline}</p>
          <p className="mt-1 text-sm text-stone-600">{msg.message}</p>
        </>
      ) : (
        <p className="mt-2 font-serif text-xl leading-snug">
          {plan.emoji} {plan.title}…
        </p>
      )}
      {calendar && (
        <p className="mt-2 flex items-center gap-2 text-xs text-stone-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          {calendar}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={onGo} className="rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
          On my way
        </button>
        <button onClick={onTomorrow} className="rounded-full bg-stone-100 px-3.5 py-1.5 text-sm hover:bg-stone-200">
          Move to tomorrow
        </button>
      </div>
    </div>
  );
}
