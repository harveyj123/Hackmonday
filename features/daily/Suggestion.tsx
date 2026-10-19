// A proactive find from a Nomi bot, popped by Sprout. The bot scouts it from shared memory (POST /api/suggest,
// owned by Bots); "Add to my plans" turns it into a plan Sprout will nudge you about.
export type BotSuggestion = {
  botId: string;
  botName: string;
  emoji: string;
  title: string;
  subtitle: string;
  why: string;
  start?: string; // ISO
  end?: string;
  location?: string;
  url?: string;
};

// POST /api/suggest
export type SuggestRequest = { memories: unknown[]; skip?: string[] };
export type SuggestResponse = { suggestion: BotSuggestion | null };

export function Suggestion({ s, onAdd, onPass }: { s: BotSuggestion; onAdd: () => void; onPass: () => void }) {
  return (
    <div
      role="dialog"
      data-hit
      aria-label={`${s.botName} found ${s.title}`}
      className="w-full rounded-[20px] rounded-br-md border-2 border-stone-900 bg-white p-4 shadow-[4px_4px_0_#1c1917] animate-[popIn_.28s_cubic-bezier(.2,.9,.25,1.15)] [transform-origin:100%_100%]"
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
          {s.emoji} {s.botName} found something for you
        </p>
        <button onClick={onPass} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <p className="mt-1 font-serif text-xl leading-snug">{s.title}</p>
      <p className="text-xs text-stone-500">{s.subtitle}</p>
      <p className="mt-2 text-sm text-stone-600">{s.why}</p>
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 underline underline-offset-2">
          See details
        </a>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={onAdd} className="rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
          Add to my plans
        </button>
        <button onClick={onPass} className="rounded-full bg-stone-100 px-3.5 py-1.5 text-sm hover:bg-stone-200">
          Not for me
        </button>
      </div>
    </div>
  );
}
