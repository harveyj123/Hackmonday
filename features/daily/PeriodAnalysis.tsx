"use client";

// The analysis box that day cards fly into: score, insights, and action items for the bots.
import { forwardRef } from "react";
import type { ActionItem } from "@/lib/types";
import type { PeriodAnalysis as Analysis } from "./types";

const BOT_LABEL: Record<string, string> = { "career-growth": "Career & Growth", "health-sports": "Health & Sports", "social-hobbies": "Social & Hobbies" };
const TONE = { up: "border-emerald-400 bg-emerald-50", down: "border-rose-400 bg-rose-50", flat: "border-amber-300 bg-amber-50" };

function short(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const PeriodAnalysisBox = forwardRef<
  HTMLDivElement,
  {
    analysis: Analysis | null;
    count: number;
    absorbing: boolean;
    onHandoff: (item: ActionItem) => void;
    onClose: () => void;
  }
>(function PeriodAnalysisBox({ analysis, count, absorbing, onHandoff, onClose }, ref) {
  const total = analysis ? analysis.score.up + analysis.score.flat + analysis.score.down || 1 : 1;
  return (
    <div
      ref={ref}
      className={`relative mb-6 overflow-hidden rounded-3xl border-2 border-stone-900 bg-white p-5 shadow-[5px_5px_0_#1c1917] transition-all duration-500 ${absorbing ? "scale-[1.02] bg-amber-50" : ""}`}
    >
      <button onClick={onClose} className="absolute right-4 top-4 text-sm text-stone-400 hover:text-stone-800" aria-label="Close analysis">
        ✕
      </button>
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-stone-500">
        Period analysis{analysis ? ` · ${short(analysis.start)} to ${short(analysis.end)}` : ""} · {count} days
      </p>

      {!analysis ? (
        <div className="flex h-40 items-center justify-center gap-3 text-stone-500">
          <span className="inline-block h-3 w-3 animate-ping rounded-full bg-amber-400" />
          Nomi is reading {count} days for patterns…
        </div>
      ) : (
        <div className="animate-[fadeUp_.5s_ease-out]">
          <h2 className="mt-1 pr-6 font-serif text-2xl leading-tight sm:text-3xl">{analysis.headline}</h2>

          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-stone-100" aria-label="Goal fit across the period">
            <div className="bg-emerald-400" style={{ width: `${(analysis.score.up / total) * 100}%` }} />
            <div className="bg-amber-300" style={{ width: `${(analysis.score.flat / total) * 100}%` }} />
            <div className="bg-rose-400" style={{ width: `${(analysis.score.down / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {analysis.score.up} moments toward your goals · {analysis.score.flat} neutral · {analysis.score.down} away
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {analysis.insights.map((i, n) => (
              <div key={n} className={`rounded-2xl border-l-4 p-3 ${TONE[i.tone]}`} style={{ animation: `fadeUp .5s ease-out ${0.1 * n}s both` }}>
                <p className="font-medium">
                  <span className="mr-1.5">{i.emoji}</span>
                  {i.title}
                </p>
                <p className="mt-0.5 text-sm text-stone-600">{i.detail}</p>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">Action items for your Nomi bots</p>
          <ul className="space-y-2">
            {analysis.actionItems.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-stone-50 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-stone-500">{a.context}</p>
                </div>
                <button
                  onClick={() => onHandoff(a)}
                  className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700"
                >
                  Send to {BOT_LABEL[a.botId] ?? a.botId} →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
