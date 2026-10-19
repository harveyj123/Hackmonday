"use client";

import type { ActionItem, DayEntry, DaySegment } from "@/lib/types";

const FRAME: Record<DaySegment["goalFit"], string> = {
  1: "ring-4 ring-emerald-400",
  0: "ring-4 ring-amber-300",
  [-1]: "ring-4 ring-rose-400",
};

export function Storyboard({
  day,
  showFrames,
  onHandoff,
}: {
  day: DayEntry;
  showFrames: boolean;
  onHandoff: (item: ActionItem) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {day.segments.map((s) => {
          const action = day.actionItems.find((a) => a.fromSegmentId === s.id);
          return (
            <article key={s.id} className={`rounded-xl bg-white p-4 shadow-sm ${showFrames ? FRAME[s.goalFit] : ""}`}>
              <div className="text-4xl">{s.emoji}</div>
              <p className="mt-2 text-xs uppercase tracking-wide text-stone-500">{s.time} · {s.place}</p>
              <h3 className="font-serif text-lg">{s.activity}</h3>
              {s.people.length > 0 && <p className="text-sm">with {s.people.join(", ")}</p>}
              {s.conversation && <p className="mt-1 text-sm italic text-stone-600">“{s.conversation}”</p>}
              {showFrames && <p className="mt-2 text-xs text-stone-500">{s.why}</p>}
              {action && (
                <button onClick={() => onHandoff(action)} className="mt-3 rounded-full bg-stone-900 px-3 py-1 text-xs text-white">
                  Hand to Nomi: {action.title}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p className="mt-6 font-serif text-lg leading-relaxed">{day.summary}</p>
    </div>
  );
}
