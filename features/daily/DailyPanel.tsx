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
import { DEMO_GOALS } from "@/lib/goals";
import type { ActionItem, DailyRequest } from "@/lib/types";
import type { AnalyzeRequest, PeriodAnalysis, StoryDay } from "./types";

export const TODAY = "2026-10-19";
export const TODAY_STORE = "nomi.daily.today";

type Tab = "today" | "plans" | "days";
const BOT_LABEL: Record<string, string> = { "scene-scout": "Scene Scout", "third-place": "Third Place" };
const FIT = { 1: "border-emerald-500", 0: "border-amber-400", [-1]: "border-rose-500" } as const;
const DOT = { calendar: "bg-red-500 rounded-sm", screentime: "bg-indigo-500 rounded-sm", reminder: "bg-orange-400 rounded-full" } as const;
const SOURCE = { calendar: "Calendar", screentime: "Screen Time", reminder: "Reminders" } as const;

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
      className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[22px] rounded-br-md border-2 border-stone-900 bg-[#fbfaf8] shadow-[4px_4px_0_#1c1917] animate-[popIn_.28s_cubic-bezier(.2,.9,.25,1.15)] [transform-origin:100%_100%]"
      aria-label="Nomi Daily"
    >
      <header className="flex items-baseline justify-between px-5 pb-1 pt-4">
        <h1 className="font-serif text-2xl">{head}</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500">Mon, Oct 19</span>
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
            {ctx && ctx.items.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                  From your Mac{ctx.source === "demo" ? " · demo feed" : ""}
                </p>
                <ul className="space-y-1 text-sm">
                  {ctx.items.map((i, n) => (
                    <li key={n} className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 flex-none ${DOT[i.kind]}`} />
                      <span className="min-w-0 truncate">{i.title}</span>
                      <span className="ml-auto flex-none text-xs text-stone-400">
                        {i.time ? `${clock(i.time)} · ` : ""}
                        {SOURCE[i.kind]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editing || !day ? (
              <Composer text={text} onText={setText} onGenerate={generate} loading={loading} />
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
                  {day.segments.slice(0, 6).map((s) => (
                    <div key={s.id} className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white p-1.5 text-center ${FIT[s.goalFit]}`}>
                      <span className="text-3xl">{s.emoji}</span>
                      <span className="line-clamp-2 text-[11px] leading-tight text-stone-600">{s.activity}</span>
                    </div>
                  ))}
                </div>
                <h2 className="font-serif text-xl leading-snug">{day.headline ?? "Your day, drawn"}</h2>
                <p className="text-sm text-stone-600">{day.summary}</p>
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

        {tab === "days" && <DaysTab today={day} onBots={onBots} />}
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
  const sorted = [...plans].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.date ?? "9").localeCompare(b.date ?? "9"));

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
          <li key={p.id} className={`flex gap-3 rounded-xl border border-stone-200 bg-white p-3 ${p.status === "done" ? "opacity-50" : ""}`}>
            <span className="text-2xl leading-none">{p.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${p.status === "done" ? "line-through" : ""}`}>{p.title}</p>
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

function DaysTab({ today, onBots }: { today?: StoryDay; onBots: (item?: ActionItem) => void }) {
  const days = [...(today ? [today] : []), ...[...SEED_DAYS].sort((a, b) => b.date.localeCompare(a.date))];
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
