"use client";

// Owned by Daily. A vertical timeline of days (dates on the left), today's composer at the top,
// magazine storyboards per day, and a period analysis that pulls a range of days into one box.
import { useEffect, useRef, useState } from "react";
import "./daily.css";
import { Pet, type PetMood } from "./Pet";
import { Storyboard } from "./Storyboard";
import { Composer } from "./Composer";
import { PeriodAnalysisBox } from "./PeriodAnalysis";
import { SEED_DAYS } from "./seed";
import { DEMO_GOALS } from "@/lib/goals";
import type { ActionItem, DailyRequest } from "@/lib/types";
import type { AnalyzeRequest, PeriodAnalysis, StoryDay } from "./types";

const TODAY = "2026-10-19";
const DATES = [TODAY, ...SEED_DAYS.map((d) => d.date).sort().reverse()];
const STORE = "nomi.daily.today";

type Flyer = { date: string; left: number; top: number; width: number; height: number; dx: number; dy: number; go: boolean };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DailyView({ onHandoff }: { onHandoff: (item: ActionItem) => void }) {
  const [days, setDays] = useState<Record<string, StoryDay>>(() => Object.fromEntries(SEED_DAYS.map((d) => [d.date, d])));
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [showFrames, setShowFrames] = useState(true);

  // Period analysis
  const [picking, setPicking] = useState<{ start?: string; end?: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ dates: string[]; result: PeriodAnalysis | null } | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [absorbing, setAbsorbing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Keep today's entry across reloads (per-browser convenience only).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { text: string; day?: StoryDay } | null;
      if (saved?.text) setText(saved.text);
      if (saved?.day) {
        setDays((d) => ({ ...d, [TODAY]: saved.day! }));
        setEditing(false);
        setOpen(TODAY);
      }
    } catch {}
  }, []);

  function save(t: string, day?: StoryDay) {
    try {
      localStorage.setItem(STORE, JSON.stringify({ text: t, day }));
    } catch {}
  }

  async function generate(input = text) {
    if (!input.trim()) return;
    setText(input);
    setLoading(true);
    try {
      const body: DailyRequest = { date: TODAY, text: input, goals: DEMO_GOALS };
      const res = await fetch("/api/daily", { method: "POST", body: JSON.stringify(body) });
      const day = (await res.json()) as StoryDay;
      setDays((d) => ({ ...d, [TODAY]: day }));
      setEditing(false);
      setOpen(TODAY);
      save(input, day);
    } finally {
      setLoading(false);
    }
  }

  // Range picking: first tap is the start, second the end (order doesn't matter).
  const range = (() => {
    if (!picking?.start) return [];
    const [a, b] = [picking.start, picking.end ?? picking.start].sort();
    return DATES.filter((d) => d >= a && d <= b && days[d]);
  })();

  function pick(date: string) {
    if (!picking || !days[date]) return;
    if (!picking.start || picking.end) setPicking({ start: date });
    else setPicking({ ...picking, end: date });
  }

  async function analyze() {
    const dates = [...range].sort();
    if (!dates.length) return;
    setPicking(null);
    setOpen(null);
    setAnalysis({ dates, result: null });
    window.scrollTo({ top: 0, behavior: "smooth" });

    const request = fetch("/api/daily/analyze", {
      method: "POST",
      body: JSON.stringify({ days: dates.map((d) => days[d]), goals: DEMO_GOALS } satisfies AnalyzeRequest),
    }).then((r) => r.json() as Promise<PeriodAnalysis>);

    // Let the box mount and the scroll settle, then fly each day's card into it.
    await wait(350);
    const box = boxRef.current?.getBoundingClientRect();
    if (box) {
      const fs: Flyer[] = dates.flatMap((d) => {
        const r = cardRefs.current[d]?.getBoundingClientRect();
        if (!r) return [];
        const height = Math.min(r.height, 140);
        return [{ date: d, left: r.left, top: r.top, width: r.width, height, dx: box.left + box.width / 2 - (r.left + r.width / 2), dy: box.top + box.height / 2 - (r.top + height / 2), go: false }];
      });
      setFlyers(fs);
      requestAnimationFrame(() => requestAnimationFrame(() => setFlyers((f) => f.map((x) => ({ ...x, go: true })))));
      await wait(750 + dates.length * 90);
      setFlyers([]);
      setAbsorbing(true);
      setTimeout(() => setAbsorbing(false), 450);
    }
    const result = await request.catch(() => null);
    setAnalysis((a) => (a ? { ...a, result } : a));
  }

  const today = days[TODAY];
  const score = today ? today.segments.reduce((n, s) => n + s.goalFit, 0) : 0;
  const mood: PetMood =
    loading || (analysis && !analysis.result) ? "busy" : analysis?.result ? "celebrating" : !today ? "neutral" : score > 0 ? "happy" : score < 0 ? "worried" : "neutral";
  const say =
    analysis && !analysis.result
      ? "looking for patterns across your days…"
      : analysis?.result
        ? "found your patterns! send one to a bot"
        : today && mood === "neutral"
          ? "a mixed day. let's tilt tomorrow green"
          : undefined;
  const flying = new Set(flyers.map((f) => f.date));

  return (
    <div className="pb-32">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-serif text-2xl">Your days</h1>
          <p className="text-sm text-stone-500">Goals: {DEMO_GOALS.map((g) => g.text).join(" · ")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFrames((v) => !v)}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm transition hover:border-stone-500"
            aria-pressed={showFrames}
          >
            {showFrames ? "Hide goal frames" : "Show goal frames"}
          </button>
          <button
            onClick={() => setPicking(picking ? null : {})}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${picking ? "bg-amber-300 text-stone-900" : "bg-stone-900 text-white hover:bg-stone-700"}`}
          >
            {picking ? "Cancel" : "◷ Analyze a period"}
          </button>
        </div>
      </div>

      {picking && (
        <div className="sticky top-2 z-40 mb-5 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-stone-900 bg-amber-100 px-4 py-3 shadow-[4px_4px_0_#1c1917]">
          <p className="text-sm font-medium">
            {!picking.start ? "Tap a start day on the timeline" : !picking.end ? "Now tap an end day" : `${range.length} days selected`}
          </p>
          <button
            onClick={analyze}
            disabled={!picking.end || range.length === 0}
            className="ml-auto rounded-full bg-stone-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Analyze {range.length || ""} days →
          </button>
        </div>
      )}

      {analysis && (
        <PeriodAnalysisBox
          ref={boxRef}
          analysis={analysis.result}
          count={analysis.dates.length}
          absorbing={absorbing}
          onHandoff={onHandoff}
          onClose={() => setAnalysis(null)}
        />
      )}

      <ol className="relative">
        {DATES.map((date, i) => {
          const day = days[date];
          const isToday = date === TODAY;
          const inRange = range.includes(date);
          const selectable = picking && day;
          const dt = new Date(date + "T12:00:00");
          return (
            <li key={date} className="grid grid-cols-[64px_1fr] gap-3 sm:grid-cols-[96px_1fr] sm:gap-5">
              <button
                onClick={() => (picking ? pick(date) : day && setOpen(open === date ? null : date))}
                className="relative flex flex-col items-end pr-4 pt-2 text-right"
                aria-label={dt.toDateString()}
              >
                <span className={`text-[11px] font-semibold uppercase tracking-widest ${isToday ? "text-rose-500" : "text-stone-500"}`}>
                  {isToday ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="font-serif text-3xl leading-none sm:text-4xl">{dt.getDate()}</span>
                <span className="text-xs text-stone-500">{dt.toLocaleDateString("en-US", { month: "short" })}</span>
                {/* rail + dot */}
                <span className={`absolute right-0 top-0 w-0.5 bg-stone-300 ${i === DATES.length - 1 ? "h-6" : "h-full"}`} />
                <span
                  className={`absolute -right-[7px] top-4 h-4 w-4 rounded-full border-2 border-stone-900 transition ${inRange ? "scale-125 bg-amber-400" : day ? "bg-white" : "bg-stone-200"}`}
                />
              </button>

              <div
                ref={(el) => {
                  cardRefs.current[date] = el;
                }}
                className={`mb-8 min-w-0 rounded-3xl transition-all duration-300 ${inRange ? "bg-amber-100 p-2 ring-2 ring-amber-400" : ""} ${selectable ? "cursor-pointer" : ""} ${flying.has(date) ? "opacity-30" : ""}`}
                onClickCapture={(e) => {
                  if (picking) {
                    e.stopPropagation();
                    e.preventDefault();
                    pick(date);
                  }
                }}
              >
                {isToday && (editing || !day) && !picking ? (
                  <Composer text={text} onText={setText} onGenerate={() => generate()} loading={loading} />
                ) : !day ? (
                  <div className="rounded-2xl border-2 border-dashed border-stone-300 p-4 text-sm text-stone-500">No entry yet today.</div>
                ) : open === date && !picking ? (
                  <div className="animate-[fadeUp_.4s_ease-out]">
                    <div className="mb-2 flex justify-end gap-3 text-xs text-stone-500">
                      {isToday && (
                        <button onClick={() => setEditing(true)} className="hover:text-stone-900">
                          ✎ Edit and regenerate
                        </button>
                      )}
                      <button onClick={() => setOpen(null)} className="hover:text-stone-900">
                        Collapse ▴
                      </button>
                    </div>
                    <Storyboard day={day} showFrames={showFrames} onHandoff={onHandoff} />
                  </div>
                ) : (
                  <MiniCard day={day} showFrames={showFrames} onOpen={() => setOpen(date)} />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {flyers.map((f, n) => (
        <div
          key={f.date}
          className="pointer-events-none fixed z-[60] overflow-hidden rounded-2xl border-2 border-stone-900 bg-white p-3 shadow-xl"
          style={{
            left: f.left,
            top: f.top,
            width: f.width,
            height: f.height,
            transform: f.go ? `translate(${f.dx}px, ${f.dy}px) scale(0.2) rotate(${n % 2 ? 6 : -6}deg)` : "none",
            opacity: f.go ? 0.15 : 1,
            transition: `transform 700ms cubic-bezier(.6,-0.2,.3,1) ${n * 90}ms, opacity 700ms ease-in ${n * 90}ms`,
          }}
        >
          {days[f.date] && <MiniCard day={days[f.date]} showFrames={showFrames} />}
        </div>
      ))}

      <Pet mood={mood} say={say} onSubmit={(t) => generate(t)} />
    </div>
  );
}

function MiniCard({ day, showFrames, onOpen }: { day: StoryDay; showFrames: boolean; onOpen?: () => void }) {
  const dot = (fit: number) => (!showFrames ? "bg-stone-300" : fit > 0 ? "bg-emerald-400" : fit < 0 ? "bg-rose-400" : "bg-amber-300");
  return (
    <button onClick={onOpen} className="block w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400 hover:shadow-md">
      <div className="flex items-center gap-2">
        {day.segments.map((s) => (
          <span key={s.id} className="relative text-2xl">
            {s.emoji}
            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${dot(s.goalFit)}`} />
          </span>
        ))}
      </div>
      <p className="mt-2 font-serif text-lg leading-snug">{day.headline ?? day.summary.split(".")[0]}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{day.summary}</p>
    </button>
  );
}
