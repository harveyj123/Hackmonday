// The desktop Sprout: a transparent, always-on-top window. Drag Sprout anywhere; click to open Daily.
// Mood follows today's check-in, which DailyView saves to localStorage in the main window.
import { useEffect, useRef, useState } from "react";
import { Sprout, SPROUT_LINES, type PetMood } from "@/features/daily/Sprout";
import type { StoryDay } from "@/features/daily/types";

const STORE = "nomi.daily.today";

function moodFromToday(): PetMood {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as { day?: StoryDay } | null;
    const segs = saved?.day?.segments ?? [];
    if (!segs.length) return "neutral";
    const fit = segs.reduce((n, s) => n + s.goalFit, 0);
    return fit > 0 ? "happy" : fit < 0 ? "worried" : "neutral";
  } catch {
    return "neutral";
  }
}

export function PetWindow() {
  const [mood, setMood] = useState<PetMood>(moodFromToday);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const onStorage = (e: StorageEvent) => e.key === STORE && setMood(moodFromToday());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="flex h-screen select-none flex-col items-center justify-end pb-2">
      <p className="mb-1 max-w-44 rounded-2xl border-2 border-stone-800 bg-white px-3 py-1.5 text-center text-xs font-medium shadow-[3px_3px_0_#292524]">
        {SPROUT_LINES[mood]}
      </p>
      <div
        role="button"
        aria-label="Open Daily check-in (drag to move)"
        title="Click to check in, drag to move"
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.screenX, y: e.screenY, moved: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.screenX - d.x;
          const dy = e.screenY - d.y;
          if (!dx && !dy) return;
          d.moved += Math.abs(dx) + Math.abs(dy);
          d.x = e.screenX;
          d.y = e.screenY;
          window.nomi?.movePet(dx, dy);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && d.moved < 5) window.nomi?.openDaily();
        }}
      >
        <Sprout mood={mood} size={110} />
      </div>
    </div>
  );
}
