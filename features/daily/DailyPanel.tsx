// Owned by Daily. Nomi Daily lives in Sprout: this panel opens beside the pet with three tabs.
// Today: what the Mac knows, the check-in, and the storyboard. Plans: notes Sprout nudges you about.
// Days: past storyboards and the period analysis. Bots live in the main window.
import { useEffect, useState } from "react";
import "./daily.css";
import { Composer } from "./Composer";
import { Magazine } from "./Magazine";
import { PeriodAnalysisBox } from "./PeriodAnalysis";
import { demoToday, pastDays } from "./demo";
import { clock, contextLines, type DayContext } from "./context";
import { addDays, whenLabel, type Plan, type PlansResponse } from "./plans";
import { dayDelta, healthByDay, stageOf, STAGE_LABEL, type HealthEvent } from "./health";
import { Sprout } from "./Sprout";
import { goalProgress } from "./memory";
import { DEMO_GOALS } from "@/lib/goals";
import { BOTS } from "@/data/bots";
import type { ActionItem, DailyRequest } from "@/lib/types";
import type { AnalyzeRequest, PeriodAnalysis, StoryDay } from "./types";

// The demo clock's day: the real start date until the presenter skips ahead (see demo.ts).
export const TODAY = demoToday();
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
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<DayContext | null>(null);

  const [reading, setReading] = useState(false);
  // Read the calendar fresh every time the panel opens, and on refresh, so edits in Calendar show up.
  function readCalendar() {
    setReading(true);
    fetch(`/api/context?date=${TODAY}&fresh=1`)
      .then((r) => r.json() as Promise<DayContext>)
      .then(setCtx)
      .catch(() => setCtx(null))
      .finally(() => setReading(false));
  }
  useEffect(readCalendar, []);

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
      className="nd-float nd-paper flex h-full w-full min-w-0 flex-col overflow-hidden"
      aria-label="Nomi Daily"
    >
      <header className="flex items-baseline justify-between px-5 pb-1.5 pt-4">
        <h1 className="font-serif text-[23px]">{head}</h1>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[#77736c]">{TODAY_LABEL}</span>
          <button onClick={onClose} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Close Nomi Daily">
            ✕
          </button>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-[#ebe8e2] px-4" role="tablist">
        {(["today", "plans", "days"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={`-mb-px border-b-2 px-2.5 py-2 text-[13.5px] capitalize transition ${tab === t ? "border-[#1d1c1a] font-semibold text-[#1d1c1a]" : "border-transparent text-[#77736c] hover:text-[#1d1c1a]"}`}
          >
            {t}
            {t === "plans" && plans.filter((p) => p.status === "upcoming").length > 0 && (
              <span className="ml-1">· {plans.filter((p) => p.status === "upcoming").length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
        {tab === "today" && (
          <>
            {ctx && !(editing || !day) && (
              <div className="flex flex-col gap-1">
                <CalendarLabel items={ctx.items} reading={reading} onRefresh={readCalendar} />
                {ctx.items.map((i, n) => (
                  <div key={n} className="flex items-center gap-2.5 text-[13px]">
                    <i className="h-2.5 w-2.5 flex-none rounded-[3px] bg-[#ff3b30]" />
                    <span className="min-w-0 truncate">{i.title}</span>
                    <em className="ml-auto flex-none text-[12px] not-italic text-[#8b877f]">{i.time ? clock(i.time) : ""}</em>
                  </div>
                ))}
              </div>
            )}

            {ctx?.error && (editing || !day) && <p className="text-[11px] text-stone-500">{ctx.error} Check that Nomi is allowed under System Settings › Privacy &amp; Security › Calendars.</p>}
            {loading ? (
              <div className="space-y-3" aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Sprout is drawing your day…</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((n) => (
                    <div key={n} className="aspect-square animate-pulse rounded-xl bg-[#ece8e1]" style={{ animationDelay: `${n * 0.15}s` }} />
                  ))}
                </div>
                <div className="h-5 w-3/4 animate-pulse rounded bg-[#ece8e1]" />
                <div className="h-3 w-full animate-pulse rounded bg-[#ece8e1]" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-[#ece8e1]" />
              </div>
            ) : editing || !day ? (
              <Composer text={text} onText={setText} onGenerate={generate} loading={loading} calendar={ctx?.items} reading={reading} onRefresh={readCalendar} />
            ) : (
              <div className="animate-[fadeUp_.3s_ease-out] space-y-3">
                <Magazine day={day} animate />
                <p className={`text-[12px] font-medium ${dayDelta(day) >= 0 ? "text-[#2f6b2b]" : "text-rose-600"}`}>
                  {dayDelta(day) > 0 ? `🌱 Today helped Sprout grow (+${dayDelta(day)})` : dayDelta(day) < 0 ? `🥀 Today dried Sprout out a little (${dayDelta(day)})` : "🌱 Sprout held steady today"}
                </p>
                {todaysPlans.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {todaysPlans.map((p) => (
                      <button key={p.id} onClick={() => onTab("plans")} className="nd-chip">
                        📌 Plan saved · {p.title}, {whenLabel(p).split(" · ")[0]}
                      </button>
                    ))}
                  </div>
                )}
                {day.actionItems.length > 0 && (
                  <ul className="space-y-2">
                    {day.actionItems.map((a) => (
                      <li key={a.id} className="nd-card flex items-center gap-2 p-2.5">
                        <p className="min-w-0 flex-1 text-[13px]">{a.title}</p>
                        <button onClick={() => onBots(a)} className="nd-pill dark flex-none !px-3 !py-1 !text-[12px]">
                          {BOT_LABEL[a.botId] ?? "Bots"} ↗
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-4 text-xs text-[#77736c]">
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

      <footer className="flex items-center justify-between border-t border-[#ebe8e2] px-5 py-2.5 text-[12.5px] text-[#77736c]">
        <button onClick={() => onTab("days")} className="hover:text-[#1d1c1a]">
          {tab === "days" ? "Week · Month" : "Analyze a period"}
        </button>
        <button onClick={() => onBots()} className="nd-pill dark ml-3 flex-none !text-[12.5px]">
          Nomi Bots ↗
        </button>
      </footer>
    </section>
  );
}

export function CalendarLabel({ items, reading, onRefresh }: { items: DayContext["items"]; reading: boolean; onRefresh: () => void }) {
  const cals = [...new Set(items.map((i) => i.calendar).filter(Boolean))];
  return (
    <div className="flex items-center justify-between">
      <span className="nd-label">From Apple Calendar{cals.length === 1 ? ` · ${cals[0]}` : ""}</span>
      <button onClick={onRefresh} disabled={reading} className="text-[11.5px] text-[#77736c] hover:text-[#1d1c1a] disabled:opacity-60" aria-label="Refresh calendar">
        {reading ? "Reading…" : "↻ Refresh"}
      </button>
    </div>
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
        className="flex items-center gap-2 rounded-[11px] border border-[#e0ddd6] bg-white p-1.5 pl-3 focus-within:border-stone-500"
      >
        <input
          id="plan-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="I want to…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button disabled={adding || !draft.trim()} className="nd-pill dark !px-3.5 !py-1 !text-[12.5px]">
          {adding ? "Saving…" : "Add"}
        </button>
      </form>
      {missed && <p className="text-xs text-stone-500">Sprout couldn't find a plan in that. Try "go to the climbing gym Thursday evening".</p>}
      {!sorted.length && (
        <p className="rounded-[11px] border border-dashed border-[#d9d5cd] p-4 text-[13px] text-[#77736c]">
          No plans yet. Mention one in your check-in, like "I want to try Sightglass Saturday", or add it here. Sprout will remind you on the day.
        </p>
      )}
      <ul className="space-y-2">
        {sorted.map((p) => (
          <li key={p.id} className={`nd-card flex gap-3 p-3 ${p.status !== "upcoming" ? "opacity-60" : ""}`}>
            <span className="text-2xl leading-none">{p.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">
                {p.title}
                {p.status === "done" && <span className="ml-2 text-xs font-normal text-emerald-700">✓ Went · Sprout grew</span>}
                {p.status === "skipped" && <span className="ml-2 text-xs font-normal text-rose-600">🥀 Skipped · Sprout wilted</span>}
              </p>
              <p className="text-[12px] text-[#77736c]">
                {whenLabel(p)}
                {p.source ? ` · from ${p.source}` : p.from ? ` · from ${new Date(p.from + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}'s check-in` : ""}
              </p>
              {p.status === "upcoming" && (
                <p className="text-[12px] text-[#2f6b2b]">
                  {p.date
                    ? `Sprout will nudge you ${new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })} at ${clock(p.time)}`
                    : "Pick a day and Sprout will nudge you"}
                </p>
              )}
              <div className="mt-1.5 flex gap-3 text-[11.5px] text-[#8b877f]">
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
  const days = [...(today ? [today] : []), ...pastDays().sort((a, b) => b.date.localeCompare(a.date))];
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

  const from = span === "week" ? addDays(TODAY, -6) : addDays(TODAY, -29);
  const kept = plans.filter((p) => p.status !== "upcoming" && (p.date ?? p.from) >= from);
  const done = kept.filter((p) => p.status === "done").length;
  const inSpan = days.filter((d) => d.date >= from);
  const onTrack = inSpan.filter((d) => dayDelta(d) > 0).length;
  const short = (unit: string, text: string) => (unit === "climbs" ? "Climb" : unit === "new builders met" ? "Meet builders" : text);
  const strip = growth.slice(-6);

  return (
    <div className="space-y-3.5">
      <div className="nd-garden px-2 pb-1.5 pt-2.5">
        <div className="flex items-baseline justify-between px-1">
          <span className="nd-label">Sprout's growth</span>
          <span className="text-[11.5px] text-[#77736c]">
            {STAGE_LABEL[stageOf(health)]} · <span className="tabular-nums">{Math.round(health)}</span>/100
          </span>
        </div>
        <div className="mt-1 grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${strip.length + 1}, minmax(0, 1fr))` }}>
          {strip.map((g) => (
            <div key={g.date} className="flex min-w-0 flex-col items-center gap-0.5 text-[10.5px] text-[#8b877f]">
              <Sprout mood={g.change > 0 ? "happy" : g.change < 0 ? "worried" : "neutral"} health={g.health} size={38} still />
              <span className={`font-semibold tabular-nums ${g.change > 0 ? "text-[#2f6b2b]" : g.change < 0 ? "text-rose-600" : ""}`}>{g.change > 0 ? `+${g.change}` : g.change}</span>
              <span>{g.date === TODAY ? "Today" : new Date(g.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}</span>
            </div>
          ))}
          <div className="flex min-w-0 flex-col items-center gap-0.5 text-[10.5px] font-semibold text-[#1d1c1a]">
            <Sprout mood="neutral" health={health} size={48} />
            <span>Now</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="nd-label">Goals {span === "week" ? "this week" : "this month"}</span>
          <div className="flex gap-1 text-[11.5px]" role="group" aria-label="Progress period">
            {(["week", "month"] as const).map((s) => (
              <button key={s} onClick={() => setSpan(s)} aria-pressed={span === s} className={`rounded-full px-2 py-0.5 ${span === s ? "bg-[#1d1c1a] text-white" : "text-[#77736c] hover:text-[#1d1c1a]"}`}>
                {s === "week" ? "This week" : "This month"}
              </button>
            ))}
          </div>
        </div>
        {[
          ...progress.map((g) => ({ id: g.goal.id, label: short(g.unit, g.goal.text), done: g[span].done, target: g[span].target, title: `${g.goal.text}: ${g[span].done} of ${g[span].target} ${g.unit}` })),
          { id: "kept", label: "Plans kept", done, target: Math.max(kept.length, 1), title: `${done} of ${kept.length} plans kept` },
          { id: "track", label: "Days on track", done: onTrack, target: Math.max(inSpan.length, 1), title: `${onTrack} of ${inSpan.length} checked-in days helped Sprout grow` },
        ].map((r) => (
          <div key={r.id} title={r.title} className="grid grid-cols-[7.5em_1fr_3em] items-center gap-2 text-[12px]">
            <span className="truncate">{r.label}</span>
            <b className="block h-2 overflow-hidden rounded-full bg-[#ece8e1]">
              <i className="block h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (r.done / r.target) * 100)}%`, background: r.done >= r.target ? "#4f9a4a" : "#e0a12b" }} />
            </b>
            <em className="text-right not-italic tabular-nums text-[#77736c]">
              {r.done} / {r.id === "kept" ? kept.length : r.id === "track" ? inSpan.length : r.target}
            </em>
          </div>
        ))}
        <p className="text-[11px] text-[#8b877f]">Shared with your Nomi bots, so they scout for where you are now.</p>
      </div>

      {analysis ? (
        <PeriodAnalysisBox analysis={analysis.result} count={days.length} absorbing={false} onHandoff={onBots} onClose={() => setAnalysis(null)} />
      ) : (
        <button onClick={analyze} className="nd-pill dark w-full !py-2">
          ◷ Analyze these {days.length} days
        </button>
      )}
      <ol className="space-y-2.5">
        {days.map((d) => {
          const dt = new Date(d.date + "T12:00:00");
          const g = byDate[d.date];
          return (
            <li key={d.date} className="flex items-start gap-3">
              <div className="w-10 flex-none pt-1 text-center">
                <p className="font-serif text-[22px] leading-none">{dt.getDate()}</p>
                <p className={`mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em] ${d.date === TODAY ? "text-rose-500" : "text-[#8b877f]"}`}>
                  {d.date === TODAY ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                {g && <p className={`mt-0.5 text-[10px] font-semibold tabular-nums ${g.change >= 0 ? "text-[#2f6b2b]" : "text-rose-600"}`}>{g.change > 0 ? `🌱+${g.change}` : g.change < 0 ? `🥀${g.change}` : "🌱"}</p>}
              </div>
              <div className="min-w-0 flex-1">
                {open === d.date ? (
                  <div className="animate-[fadeUp_.3s_ease-out]">
                    <button onClick={() => setOpen(null)} className="mb-1 text-xs text-[#77736c] hover:text-[#1d1c1a]">
                      Collapse ▴
                    </button>
                    <Magazine day={d} />
                  </div>
                ) : (
                  <button onClick={() => setOpen(d.date)} className="nd-card block w-full px-3 py-2 text-left transition hover:border-[#c9c5bd]">
                    <p className="text-[15px] tracking-[0.15em]">{d.segments.map((s) => s.emoji).join("")}</p>
                    <p className="font-serif text-[15px] leading-snug">{d.headline ?? d.summary.split(".")[0]}</p>
                    <p className="line-clamp-2 text-[11.5px] text-[#77736c]">{d.summary}</p>
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
