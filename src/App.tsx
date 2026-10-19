// The main window is Nomi Bots. Nomi Daily lives in Sprout (src/PetWindow.tsx); a hand-off from a
// storyboard arrives here over IPC and opens its bot, and "Daily" in Bots opens Sprout's panel.
import { useEffect, useState } from "react";
import { BotsView } from "@/features/bots/BotsView";
import type { ActionItem } from "@/lib/types";

export default function Home() {
  const [handoff, setHandoff] = useState<ActionItem | null>(null);

  useEffect(() => window.nomi?.onHandoff(setHandoff), []);

  return (
    <BotsView handoff={handoff} onHandoffConsumed={() => setHandoff(null)} onOpenDaily={() => window.nomi?.openDaily()} />
  );
}
