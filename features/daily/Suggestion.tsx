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

// Thumbnail colors per bot, as in the mockup's cards.
const THUMB: Record<string, string> = {
  "career-growth": "linear-gradient(135deg,#2d2b55,#6a4fb5 55%,#f08a5d)",
  "health-sports": "linear-gradient(135deg,#12343b,#2c7873 55%,#e1b382)",
  "social-hobbies": "linear-gradient(135deg,#3d6b4a,#9cc98a)",
};

export function Suggestion({ s, onAdd, onPass }: { s: BotSuggestion; onAdd: () => void; onPass: () => void }) {
  return (
    <div role="dialog" data-hit aria-label={`${s.botName} found ${s.title}`} className="nd-float flex w-full flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2 text-[12px] text-[#6d6a64]">
        <img src={`/mascots/${s.botId}.png`} alt="" className="h-7 w-7 rounded-[38%] object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
        <span className="min-w-0 flex-1">{s.botName} found this for you</span>
        <button onClick={onPass} className="text-sm text-stone-400 hover:text-stone-800" aria-label="Not for me">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-[11px] border border-[#ececec] p-2.5">
        <div className="grid h-12 w-12 flex-none place-items-center rounded-lg text-xl" style={{ background: THUMB[s.botId] ?? THUMB["social-hobbies"] }}>
          {s.emoji}
        </div>
        <div className="flex min-w-0 flex-col">
          <b className="font-serif text-[17px] leading-tight">{s.title}</b>
          <small className="text-[12px] text-[#77736c]">{s.subtitle}</small>
        </div>
      </div>
      <p className="text-[12px] text-[#2f6b2b]">{s.why}</p>
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="-mt-1 text-[12px] text-[#77736c] underline underline-offset-2">
          See details
        </a>
      )}
      <p className="text-[11px] text-[#8b877f]">Adding it gives Sprout something to grow on. Passing wilts it a little.</p>
      <div className="flex gap-2">
        <button onClick={onAdd} className="nd-pill green">
          Add to plans
        </button>
        <button onClick={onPass} className="nd-pill">
          Not for me
        </button>
      </div>
    </div>
  );
}
