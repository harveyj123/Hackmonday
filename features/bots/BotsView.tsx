"use client";

// Owned by Bots. Grid of bots; tap one to chat. A hand-off from Daily opens its bot directly.
import { useEffect, useState } from "react";
import { ChatThread } from "./ChatThread";
import { BOTS } from "@/data/bots";
import type { ActionItem, Bot } from "@/lib/types";

export function BotsView({ handoff, onHandoffConsumed }: { handoff: ActionItem | null; onHandoffConsumed: () => void }) {
  const [active, setActive] = useState<Bot | null>(null);
  const [pending, setPending] = useState<ActionItem | null>(null);

  useEffect(() => {
    if (!handoff) return;
    setActive(BOTS.find((b) => b.id === handoff.botId) ?? null);
    setPending(handoff);
    onHandoffConsumed();
  }, [handoff, onHandoffConsumed]);

  if (active) {
    return (
      <ChatThread
        key={active.id}
        bot={active}
        handoff={pending}
        onBack={() => {
          setActive(null);
          setPending(null);
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {BOTS.map((b) => (
        <button
          key={b.id}
          disabled={!b.live}
          onClick={() => setActive(b)}
          className="rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow-md disabled:opacity-50"
        >
          <div className="text-3xl">{b.emoji}</div>
          <p className="mt-2 font-medium">{b.name}</p>
          <p className="text-xs text-stone-500">{b.live ? b.tagline : "coming soon"}</p>
        </button>
      ))}
    </div>
  );
}
