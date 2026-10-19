"use client";

// One-page magazine spread for a day: masthead, headline, panels framed by goal fit, cast, places, mood.
import type { ActionItem, DaySegment, Mood } from "@/lib/types";
import type { StoryDay } from "./types";

const FRAME: Record<DaySegment["goalFit"], string> = {
  1: "border-emerald-500 shadow-[5px_5px_0_#10b981]",
  0: "border-amber-400 shadow-[5px_5px_0_#fbbf24]",
  [-1]: "border-rose-500 shadow-[5px_5px_0_#f43f5e]",
};
const PLAIN = "border-stone-900 shadow-[5px_5px_0_#1c1917]";
const TAG: Record<DaySegment["goalFit"], [string, string]> = {
  1: ["toward your goals", "bg-emerald-100 text-emerald-800"],
  0: ["neutral", "bg-amber-100 text-amber-800"],
  [-1]: ["away from your goals", "bg-rose-100 text-rose-800"],
};
const SKY: Record<Mood, string> = {
  great: "from-amber-200 via-orange-100 to-rose-100",
  good: "from-sky-100 via-emerald-50 to-amber-50",
  meh: "from-stone-200 via-stone-100 to-sky-50",
  low: "from-slate-300 via-slate-200 to-indigo-100",
};
const MOOD_LABEL: Record<Mood, string> = { great: "Great", good: "Good", meh: "Meh", low: "Low" };
const MOOD_LEVEL: Record<Mood, number> = { great: 4, good: 3, meh: 2, low: 1 };

// Wide layout: the lead panel takes two rows, the rest flow around it.
const SPANS = ["sm:col-span-4 sm:row-span-2", "sm:col-span-2", "sm:col-span-2", "sm:col-span-2", "sm:col-span-2", "sm:col-span-2"];

export function longDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function Storyboard({
  day,
  showFrames,
  onHandoff,
}: {
  day: StoryDay;
  showFrames: boolean;
  onHandoff: (item: ActionItem) => void;
}) {
  // Lead with the strongest moment, then keep the rest in time order.
  const leadIdx = Math.max(0, day.segments.findIndex((s) => s.goalFit === 1 && s.people.length));
  const ordered = [day.segments[leadIdx], ...day.segments.filter((_, i) => i !== leadIdx)].filter(Boolean);
  const people = [...new Set(day.segments.flatMap((s) => s.people))];
  const places = [...new Set(day.segments.map((s) => s.place).filter(Boolean))];

  return (
    <article className="rounded-3xl bg-[#fffdf8] p-5 ring-1 ring-stone-200 sm:p-7">
      <header className="border-b-4 border-double border-stone-900 pb-3">
        <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.25em] text-stone-500">
          <span>Nomi Daily</span>
          <span>{longDate(day.date)}</span>
        </div>
        <h2 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{day.headline ?? "Your day, drawn"}</h2>
        <p className="mt-2 max-w-3xl font-serif text-base leading-relaxed text-stone-700 first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-5xl first-letter:leading-[0.8]">
          {day.summary}
        </p>
      </header>

      <MoodRibbon segments={day.segments} showFrames={showFrames} />

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-6">
        {ordered.map((s, i) => (
          <Panel
            key={s.id}
            s={s}
            lead={i === 0}
            span={SPANS[i] ?? "sm:col-span-2"}
            showFrames={showFrames}
            action={day.actionItems.find((a) => a.fromSegmentId === s.id)}
            onHandoff={onHandoff}
          />
        ))}
      </div>

      <footer className="mt-6 grid gap-4 border-t border-stone-300 pt-4 text-sm sm:grid-cols-3">
        <Box title="The cast">
          {people.length ? (
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => (
                <span key={p} className="flex items-center gap-1.5 rounded-full bg-stone-100 py-0.5 pl-0.5 pr-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{p[0]}</span>
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-stone-500">Just you today.</p>
          )}
        </Box>
        <Box title="On location">
          <p className="text-stone-700">{places.join(" · ")}</p>
        </Box>
        <Box title="Conversations">
          {day.segments.filter((s) => s.conversation).length ? (
            day.segments
              .filter((s) => s.conversation)
              .map((s) => (
                <p key={s.id} className="font-serif italic text-stone-700">
                  “{s.conversation}”
                </p>
              ))
          ) : (
            <p className="text-stone-500">Nothing notable said.</p>
          )}
        </Box>
      </footer>
    </article>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">{title}</p>
      {children}
    </div>
  );
}

function MoodRibbon({ segments, showFrames }: { segments: DaySegment[]; showFrames: boolean }) {
  return (
    <div className="mt-4 flex items-end gap-1.5" aria-label="Mood through the day">
      {segments.map((s) => (
        <div key={s.id} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`w-full rounded-t-md ${showFrames ? (s.goalFit === 1 ? "bg-emerald-400" : s.goalFit === -1 ? "bg-rose-400" : "bg-amber-300") : "bg-stone-300"}`}
            style={{ height: 6 + MOOD_LEVEL[s.mood] * 7 }}
            title={`${s.time} ${MOOD_LABEL[s.mood]}`}
          />
          <span className="text-[10px] tabular-nums text-stone-500">{s.time}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({
  s,
  lead,
  span,
  showFrames,
  action,
  onHandoff,
}: {
  s: DaySegment;
  lead: boolean;
  span: string;
  showFrames: boolean;
  action?: ActionItem;
  onHandoff: (item: ActionItem) => void;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-2xl border-[3px] bg-white transition-all duration-300 ${span} ${showFrames ? FRAME[s.goalFit] : PLAIN}`}>
      <div className={`relative flex items-center justify-center bg-gradient-to-br ${SKY[s.mood]} ${lead ? "h-48 sm:h-64" : "h-24"}`}>
        <span className={lead ? "text-8xl drop-shadow-sm" : "text-5xl"}>{s.emoji}</span>
        <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums">{s.time}</span>
        <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[11px]">Mood: {MOOD_LABEL[s.mood]}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{s.place}</p>
        <h3 className={`font-serif leading-snug ${lead ? "text-2xl" : "text-lg"}`}>{s.activity}</h3>
        {s.people.length > 0 && <p className="mt-1 text-sm text-stone-600">with {s.people.join(", ")}</p>}
        {lead && s.conversation && (
          <blockquote className="mt-3 border-l-4 border-stone-900 pl-3 font-serif text-lg italic text-stone-800">“{s.conversation}”</blockquote>
        )}
        {showFrames && (
          <p className="mt-3 text-xs text-stone-600">
            <span className={`mr-1.5 rounded-full px-2 py-0.5 font-medium ${TAG[s.goalFit][1]}`}>{TAG[s.goalFit][0]}</span>
            {s.why}
          </p>
        )}
        {action && (
          <button
            onClick={() => onHandoff(action)}
            className="mt-auto self-start pt-3"
          >
            <span className="inline-flex items-center gap-1.5 rounded-2xl bg-stone-900 px-3 py-1.5 text-left text-xs font-medium text-white transition hover:bg-stone-700">
              Hand to Nomi: {action.title} →
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
