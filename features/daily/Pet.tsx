"use client";

// The Nomi pet: lives bottom-right, is the daily check-in, and shows the day's mood.
import { useState } from "react";
import { Sprout, SPROUT_LINES, type PetMood } from "./Sprout";

export type { PetMood };

export function Pet({ mood, say, onSubmit }: { mood: PetMood; say?: string; onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const shown: PetMood = open ? "listening" : mood;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="w-72 rounded-2xl bg-white p-3 shadow-xl">
          <p className="mb-2 text-sm">hey, how'd today go?</p>
          <textarea
            autoFocus
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
      ) : (
        <p className="max-w-56 rounded-2xl rounded-br-sm border-2 border-stone-800 bg-white px-3 py-2 text-sm font-medium shadow-[3px_3px_0_#292524]">
          {say ?? SPROUT_LINES[mood]}
        </p>
      )}
      <button onClick={() => setOpen((o) => !o)} className="rounded-full" aria-label="Talk to Sprout">
        <Sprout mood={shown} size={104} />
      </button>
    </div>
  );
}
