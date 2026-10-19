"use client";

// The Nomi pet: lives bottom-right, is the daily check-in, and shows the day's mood.
import { useState } from "react";

export type PetMood = "happy" | "neutral" | "sad" | "busy";

const FACES: Record<PetMood, string> = { happy: "^ᴗ^", neutral: "•ᴗ•", sad: "•︵•", busy: "•_•" };

export function Pet({ mood, onSubmit }: { mood: PetMood; onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 rounded-2xl bg-white p-3 shadow-xl">
          <p className="mb-2 text-sm">hey, how'd today go?</p>
          <textarea
            className="h-24 w-full resize-none rounded-lg border border-stone-200 p-2 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="I worked from home all morning..."
          />
          <button
            className="mt-2 w-full rounded-lg bg-stone-900 py-1.5 text-sm text-white"
            onClick={() => {
              onSubmit(text);
              setOpen(false);
            }}
          >
            Make my storyboard
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-16 w-16 items-center justify-center rounded-full bg-amber-200 text-lg shadow-lg ${mood === "happy" ? "animate-bounce" : ""} ${mood === "busy" ? "animate-pulse" : ""}`}
        aria-label="Talk to Nomi"
      >
        {FACES[mood]}
      </button>
    </div>
  );
}
