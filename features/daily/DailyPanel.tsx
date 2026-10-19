// Owned by Daily. Nomi Daily lives in Sprout: this panel opens beside the pet with three tabs.
// Today: what the Mac knows, the check-in, and the storyboard. Plans: notes Sprout nudges you about.
// Days: past storyboards and the period analysis. Bots live in the main window.
import { useEffect, useState } from "react";
import "./daily.css";
import { Composer } from "./Composer";
import { Storyboard } from "./Storyboard";
import { PeriodAnalysisBox } from "./PeriodAnalysis";
import { SEED_DAYS } from "./seed";
import { clock, contextLines, type DayContext } from "./context";
import { whenLabel, type Plan, type PlansResponse } from "./plans";
import { dayDelta, healthByDay, stageOf, STAGE_LABEL, type HealthEvent } from "./health";
import { Sprout } from "./Sprout";
import { goalProgress } from "./memory";
import { DEMO_GOALS } from "@/lib/goals";
import { BOTS } from "@/data/bots";
import type { ActionItem, DailyRequest } from "@/lib/types";
import type { AnalyzeRequest, PeriodAnalysis, StoryDay } from "./types";

export const TODAY = "2026-10-19";
export const TODAY_STORE = "nomi.daily.today";
const TODAY_LABEL = new Date(TODAY + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

type Tab = "today" | "plans" | "days";
const BOT_LABEL: Record<string, string> = Object.fromEntries(BOTS.map((b) => [b.id, b.name]));
const FIT = { 1: "border-emerald-500", 0: "border-amber-400", [-1]: "border-rose-500" } as const;

export function loadToday(): { text: string; day?: StoryDay } {
  try {
    return JSON.parse(localStorage.getItem(TODAY_STORE) ?? "null") ?? { text: "" };
  } catch {
    return { text: "" };
  }
}

function saveToday(text: string, day?: StoryDay) {
  try {
    localStorage.setItem(TODAY_STORE, JSON.stringify({ text, day }));
  } catch {}
}

export function DailyPanel({
  tab,
  onTab,
  plans,
  onPlans,
  events,
  health,
  onBusy,
  onDay,
  onBots,
  onPreviewNudge,
  onClose,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  plans: Plan[];
  onPlans: (fn: (p: Plan[]) => Plan[]) => void;
  events: HealthEvent[];
  health: number;
  onBusy: (busy: boolean) => void;
  onDay: (day: StoryDay | undefined) => void;
  onBots: (item?: ActionItem) => void;
  onPreviewNudge: (p: Plan) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => loadToday().text);
  const [day, setDay] = useState<StoryDay | undefined>(() => loadToday().day);
  const [editing, setEditing] = useState(() => !loadToday().day);
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<DayContext | null>(null);

  useEffect(() => {
    fetch(`/api/context?date=${TODAY}`)
      .then((r) => r.json() as Promise<DayContext>)
      .then(setCtx)
      .catch(() => setCtx(null));
  }, []);

  async function extractPlans(input: string) {
    const res = await fetch("/api/plans", { method: "POST", body: JSON.stringify({ text: input, today: TODAY }) });
    const { plans: found } = (await res.json()) as PlansResponse;
    // A plan with the same title replaces the old one, so regenerating doesn't duplicate it.
    onPlans((old) => [...old.filter((p) => !found.some((f) => f.title.toLowerCase() === p.title.toLowerCase())), ...found]);
    return found;
  }

  async function generate() {
    if (!text.trim()) return;
    setLoading(true);
    onBusy(true);
    try {
      const body: DailyRequest = { date: TODAY, text, goals: DEMO_GOALS, context: ctx ? contextLines(ctx.items) : undefined };
      const [res] = await Promise.all([fetch("/api/daily", { method: "POST", body: JSON.stringify(body) }), extractPlans(text).catch(() => [])]);
      const next = (await res.json()) as StoryDay;
      setDay(next);
      setEditing(false);
      setFull(false);
      saveToday(text, next);
      onDay(next);
    } finally {
      setLoading(false);
      onBusy(false);
    }
  }

  const todaysPlans = plans.filter((p) => p.from === TODAY);
  const head = tab === "today" ? "Today" : tab === "plans" ? "Plans" : "Your days";

  return (
    <section
      data-hit
      className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[22px] rounded-br-md border-2 border-stone-900 bg-[#fbfaf8] shadow-[4px_4px_0_#1c1917] animate-[popIn_.28s_cubic-bezier(.2,.9,.25,1.15)] [transform-origin:100%_100%]"
      aria-label="Nomi Daily"
    >
      <header className="flex items-baseline justify-between px-5 pb-1 pt-4">
        <h1 className="font-serif text-2xl">{head}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500">{TODAY_LABEL}</span>
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Close Nomi Daily">
            ✕
          </button>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-stone-200 px-4" role="tablist">
        {(["today", "plans", "days"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={`-mb-px border-b-2 px-2.5 py-2 text-sm capitalize transition ${tab === t ? "border-stone-900 font-semibold text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {t}
            {t === "plans" && plans.filter((p) => p.status === "upcoming").length > 0 && (
              <span className="ml-1 text-xs text-stone-400">· {plans.filter((p) => p.status === "upcoming").length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {tab === "today" && (
          <>
            {ctx && ctx.items.length > 0 && !(editing || !day) && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                  From your calendar{ctx.source === "demo" ? " · demo feed" : ""}
                </p>
                <ul className="space-y-1 text-sm">
                  {ctx.items.map((i, n) => (
                    <li key={n} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 flex-none rounded-sm bg-red-500" />
                      <span className="min-w-0 truncate">{i.title}</span>
                      <span className="ml-auto flex-none text-xs text-stone-400">
                        {i.time ? clock(i.time) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ctx?.source === "demo" && (editing || !day) && <p className="text-[11px] text-stone-400">Calendar: demo feed</p>}
            {loading ? (
              <div className="space-y-3" aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Sprout is drawing your day…</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((n) => (
                    <div key={n} className="aspect-square animate-pulse rounded-xl bg-stone-200" style={{ animationDelay: `${n * 0.15}s` }} />
                  ))}
                </div>
                <div className="h-5 w-3/4 animate-pulse rounded bg-stone-200" />
                <div className="h-3 w-full animate-pulse rounded bg-stone-200" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-stone-200" />
              </div>
            ) : editing || !day ? (
              <Composer text={text} onText={setText} onGenerate={generate} loading={loading} calendar={ctx?.items} />
            ) : full ? (
              <div className="animate-[fadeUp_.3s_ease-out]">
                <button onClick={() => setFull(false)} className="mb-2 text-xs text-stone-500 hover:text-stone-900">
                  ← Back to today
                </button>
                <Storyboard day={day} showFrames onHandoff={onBots} />
              </div>
            ) : (
              <div className="animate-[fadeUp_.3s_ease-out] space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Today's storyboard</p>
                <div className="grid grid-cols-3 gap-2">
                  {day.segments.slice(0, 6).map((s, n) => (
                    <div
                      key={s.id}
                      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white p-1.5 text-center ${FIT[s.goalFit]}`}
                      style={{ animation: `popIn .4s cubic-bezier(.2,.9,.25,1.2) ${0.12 * n}s both` }}
                    >
                      <span className="text-3xl">{s.emoji}</span>
                      <span className="line-clamp-2 text-[11px] leading-tight text-stone-600">{s.activity}</span>
                    </div>
                  ))}
                </div>
                <h2 className="font-serif text-xl leading-snug">{day.headline ?? "Your day, drawn"}</h2>
                <p className="text-sm text-stone-600">{day.summary}</p>
                <p className={`text-xs font-medium ${dayDelta(day) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {dayDelta(day) > 0 ? `🌱 Today helped Sprout grow (+${dayDelta(day)})` : dayDelta(day) < 0 ? `🥀 Today dried Sprout out a little (${dayDelta(day)})` : "🌱 Sprout held steady today"}
                </p>
                {todaysPlans.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {todaysPlans.map((p) => (
                      <button key={p.id} onClick={() => onTab("plans")} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                        📌 Plan saved · {p.title}, {whenLabel(p).split(" · ")[0]}
                      </button>
                    ))}
                  </div>
                )}
                {day.actionItems.length > 0 && (
                  <ul className="space-y-2">
                    {day.actionItems.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 rounded-xl bg-stone-100 p-2.5">
                        <p className="min-w-0 flex-1 text-sm">{a.title}</p>
                        <button onClick={() => onBots(a)} className="flex-none rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                          {BOT_LABEL[a.botId] ?? "Bots"} ↗
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-4 text-xs text-stone-500">
                  <button onClick={() => setFull(true)} className="hover:text-stone-900">
                    Full storyboard
                  </button>
                  <button onClick={() => setEditing(true)} className="hover:text-stone-900">
                    ✎ Edit and regenerate
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "plans" && <PlansTab plans={plans} onPlans={onPlans} onAdd={extractPlans} onPreviewNudge={onPreviewNudge} />}

        {tab === "days" && <DaysTab today={day} plans={plans} events={events} health={health} onBots={onBots} />}
      </div>

      <footer className="flex items-center justify-between border-t border-stone-200 px-4 py-2.5 text-xs text-stone-500">
        <span>Goals: {DEMO_GOALS.map((g) => g.text).join(" · ")}</span>
        <button onClick={() => onBots()} className="ml-3 flex-none rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-stone-700">
          Nomi Bots ↗
        </button>
      </footer>
    </section>
  );
}

function PlansTab({
  plans,
  onPlans,
  onAdd,
  onPreviewNudge,
}: {
  plans: Plan[];
  onPlans: (fn: (p: Plan[]) => Plan[]) => void;
  onAdd: (text: string) => Promise<Plan[]>;
  onPreviewNudge: (p: Plan) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [missed, setMissed] = useState(false);
  const sorted = [...plans].sort((a, b) => Number(a.status !== "upcoming") - Number(b.status !== "upcoming") || (a.date ?? "9").localeCompare(b.date ?? "9"));

  async function add() {
    if (!draft.trim()) return;
    setAdding(true);
    setMissed(false);
    try {
      // "I want to …" reads naturally to the extractor even when the person types just the plan.
      const text = /\b(want|wanna|gonna|going to|plan|should|need)\b/i.test(draft) ? draft : `I want to ${draft}`;
      const found = await onAdd(text);
      if (found.length) setDraft("");
      else setMissed(true);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white p-1.5 pl-3 focus-within:border-stone-500"
      >
        <input
          id="plan-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="I want to try Sightglass Saturday morning"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button disabled={adding || !draft.trim()} className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">
          {adding ? "Saving…" : "Add"}
        </button>
      </form>
      {missed && <p className="text-xs text-stone-500">Sprout couldn't find a plan in that. Try "go to the climbing gym Thursday evening".</p>}
      {!sorted.length && (
        <p className="rounded-xl border-2 border-dashed border-stone-300 p-4 text-sm text-stone-500">
          No plans yet. Mention one in your check-in, like "I want to try Sightglass Saturday", or add it here. Sprout will remind you on the day.
        </p>
      )}
      <ul className="space-y-2">
        {sorted.map((p) => (
          <li key={p.id} className={`flex gap-3 rounded-xl border border-stone-200 bg-white p-3 ${p.status !== "upcoming" ? "opacity-60" : ""}`}>
            <span className="text-2xl leading-none">{p.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {p.title}
                {p.status === "done" && <span className="ml-2 text-xs font-normal text-emerald-700">✓ Went · Sprout grew</span>}
                {p.status === "skipped" && <span className="ml-2 text-xs font-normal text-rose-600">🥀 Skipped · Sprout wilted</span>}
              </p>
              <p className="text-xs text-stone-500">
                {whenLabel(p)}
                {p.from ? ` · from ${new Date(p.from + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}'s check-in` : ""}
              </p>
              {p.status === "upcoming" && (
                <p className="text-xs text-emerald-700">
                  {p.date
                    ? `Sprout will nudge you ${new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })} at ${clock(p.time)}`
                    : "Pick a day and Sprout will nudge you"}
                </p>
              )}
              <div className="mt-1.5 flex gap-3 text-xs text-stone-500">
                {p.status === "upcoming" && (
                  <button onClick={() => onPreviewNudge(p)} className="hover:text-stone-900">
                    ▶ Preview nudge
                  </button>
                )}
                <button onClick={() => onPlans((all) => all.filter((x) => x.id !== p.id))} className="hover:text-stone-900">
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DaysTab({
  today,
  plans,
  events,
  health,
  onBots,
}: {
  today?: StoryDay;
  plans: Plan[];
  events: HealthEvent[];
  health: number;
  onBots: (item?: ActionItem) => void;
}) {
  const [span, setSpan] = useState<"week" | "month">("week");
  const days = [...(today ? [today] : []), ...[...SEED_DAYS].sort((a, b) => b.date.localeCompare(a.date))];
  const growth = healthByDay(days, events);
  const byDate = Object.fromEntries(growth.map((g) => [g.date, g]));
  const progress = goalProgress(TODAY, days, plans);
  const [open, setOpen] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ result: PeriodAnalysis | null } | null>(null);

  async function analyze() {
    setOpen(null);
    setAnalysis({ result: null });
    const body: AnalyzeRequest = { days: [...days].sort((a, b) => a.date.localeCompare(b.date)), goals: DEMO_GOALS };
    const result = await fetch("/api/daily/analyze", { method: "POST", body: JSON.stringify(body) })
      .then((r) => r.json() as Promise<PeriodAnalysis>)
      .catch(() => null);
    setAnalysis({ result });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-stone-200 bg-gradient-to-b from-emerald-50 to-white p-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Sprout's growth</p>
          <p className="text-xs text-stone-600">
            {STAGE_LABEL[stageOf(health)]} · <span className="tabular-nums">{Math.round(health)}</span>/100
          </p>
        </div>
        <div className="mt-2 flex items-end justify-between gap-1">
          {growth.map((g) => (
            <div key={g.date} className="flex min-w-0 flex-col items-center">
              <Sprout mood={g.change > 0 ? "happy" : g.change < 0 ? "worried" : "neutral"} health={g.health} size={40} className="[&_*]:!animate-none" />
              <span className={`text-[10px] font-semibold tabular-nums ${g.change > 0 ? "text-emerald-700" : g.change < 0 ? "text-rose-600" : "text-stone-400"}`}>
                {g.change > 0 ? `+${g.change}` : g.change}
              </span>
              <span className="text-[10px] text-stone-500">{g.date === TODAY ? "Today" : new Date(g.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</span>
            </div>
          ))}
          <div className="flex min-w-0 flex-col items-center">
            <Sprout mood="neutral" health={health} size={52} />
            <span className="text-[10px] font-semibold text-stone-700">Now</span>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${health}%` }} />
        </div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Goal progress</p>
          <div className="flex rounded-full bg-stone-100 p-0.5 text-xs" role="group" aria-label="Progress period">
            {(["week", "month"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpan(s)}
                aria-pressed={span === s}
                className={`rounded-full px-2.5 py-0.5 capitalize ${span === s ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}
              >
                {s === "week" ? "This week" : "This month"}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-2 space-y-2.5">
          {progress.map((g) => {
            const p = g[span];
            return (
              <li key={g.goal.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{g.goal.text}</span>
                  <span className="flex-none text-xs tabular-nums text-stone-500">
                    {p.done}/{p.target} {g.unit}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${p.done >= p.target ? "bg-emerald-500" : "bg-amber-400"}`}
                    style={{ width: `${Math.min(100, (p.done / p.target) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-stone-400">Shared with your Nomi bots, so they scout for where you are now.</p>
      </div>
      {analysis ? (
        <PeriodAnalysisBox analysis={analysis.result} count={days.length} absorbing={false} onHandoff={onBots} onClose={() => setAnalysis(null)} />
      ) : (
        <button onClick={analyze} className="w-full rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
          ◷ Analyze these {days.length} days
        </button>
      )}
      <ol className="space-y-3">
        {days.map((d) => {
          const dt = new Date(d.date + "T12:00:00");
          return (
            <li key={d.date} className="flex gap-3">
              <div className="w-10 flex-none pt-1 text-center">
                <p className={`text-[10px] font-semibold uppercase tracking-widest ${d.date === TODAY ? "text-rose-500" : "text-stone-500"}`}>
                  {d.date === TODAY ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p className="font-serif text-2xl leading-none">{dt.getDate()}</p>
                {byDate[d.date] && (
                  <p className={`mt-1 text-[10px] font-semibold tabular-nums ${byDate[d.date].change >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {byDate[d.date].change > 0 ? "🌱+" : byDate[d.date].change < 0 ? "🥀" : "🌱"}
                    {byDate[d.date].change || ""}
                  </p>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {open === d.date ? (
                  <div className="animate-[fadeUp_.3s_ease-out]">
                    <button onClick={() => setOpen(null)} className="mb-1 text-xs text-stone-500 hover:text-stone-900">
                      Collapse ▴
                    </button>
                    <Storyboard day={d} showFrames onHandoff={onBots} />
                  </div>
                ) : (
                  <button onClick={() => setOpen(d.date)} className="block w-full rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-stone-400">
                    <p className="text-lg tracking-widest">{d.segments.map((s) => s.emoji).join("")}</p>
                    <p className="font-serif leading-snug">{d.headline ?? d.summary.split(".")[0]}</p>
                    <p className="line-clamp-2 text-xs text-stone-500">{d.summary}</p>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
