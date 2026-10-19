// The main window is Nomi Bots. Nomi Daily lives in Sprout (src/PetWindow.tsx); a hand-off from a
// storyboard arrives here over IPC and opens its bot.
import { useEffect, useState } from "react";
import { BotsView } from "@/features/bots/BotsView";
import type { ActionItem } from "@/lib/types";

export default function Home() {
  const [handoff, setHandoff] = useState<ActionItem | null>(null);

  useEffect(() => window.nomi?.onHandoff(setHandoff), []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="font-serif text-2xl">Nomi Bots</h1>
        <p className="text-sm text-stone-500">Your daily check-in lives in Sprout. Click the pet on your desktop.</p>
      </header>
      <BotsView handoff={handoff} onHandoffConsumed={() => setHandoff(null)} />
    </main>
  );
}
