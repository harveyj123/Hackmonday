"use client";

// Shared shell. The only coupling between features is the ActionItem hand-off below.
import { useState } from "react";
import { ModeToggle, type Mode } from "@/components/ModeToggle";
import { DailyView } from "@/features/daily/DailyView";
import { BotsView } from "@/features/bots/BotsView";
import type { ActionItem } from "@/lib/types";

export default function Home() {
  const [mode, setMode] = useState<Mode>("daily");
  const [handoff, setHandoff] = useState<ActionItem | null>(null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <ModeToggle mode={mode} onChange={setMode} />
      <div className="mt-6">
        {mode === "daily" ? (
          <DailyView
            onHandoff={(item) => {
              setHandoff(item);
              setMode("bots");
            }}
          />
        ) : (
          <BotsView handoff={handoff} onHandoffConsumed={() => setHandoff(null)} />
        )}
      </div>
    </main>
  );
}
