"use client";

// Owned by Daily. Timeline on the left, storyboard on the right, pet in the corner.
import { useState } from "react";
import { Pet, type PetMood } from "./Pet";
import { Storyboard } from "./Storyboard";
import { DEMO_GOALS } from "@/lib/goals";
import { SEED_DATES } from "@/data/mock-day";
import type { ActionItem, DailyRequest, DayEntry } from "@/lib/types";

const TODAY = "2026-10-19";

export function DailyView({ onHandoff }: { onHandoff: (item: ActionItem) => void }) {
  const [day, setDay] = useState<DayEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFrames, setShowFrames] = useState(true);

  async function generate(text: string) {
    setLoading(true);
    const body: DailyRequest = { date: TODAY, text, goals: DEMO_GOALS };
    const res = await fetch("/api/daily", { method: "POST", body: JSON.stringify(body) });
    setDay(await res.json());
    setLoading(false);
  }

  const score = day ? day.segments.reduce((n, s) => n + s.goalFit, 0) : 0;
  const mood: PetMood = loading ? "busy" : !day ? "neutral" : score > 0 ? "happy" : score < 0 ? "sad" : "neutral";

  return (
    <div className="flex gap-6">
      <aside className="w-36 shrink-0 space-y-2 text-sm">
        {[...SEED_DATES, TODAY].map((d) => (
          <div key={d} className={`rounded-lg px-3 py-2 ${d === TODAY ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}>
            {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </div>
        ))}
      </aside>
      <section className="flex-1">
        <div className="mb-4 flex justify-end">
          <label className="flex items-center gap-2 text-sm text-stone-500">
            <input type="checkbox" checked={showFrames} onChange={(e) => setShowFrames(e.target.checked)} />
            Goal frames
          </label>
        </div>
        {loading && <p className="text-stone-500">Nomi is drawing your day…</p>}
        {!loading && !day && <p className="text-stone-500">Tap Nomi in the corner to tell it about your day.</p>}
        {!loading && day && <Storyboard day={day} showFrames={showFrames} onHandoff={onHandoff} />}
      </section>
      <Pet mood={mood} onSubmit={generate} />
    </div>
  );
}
