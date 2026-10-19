// The day as a magazine spread, sized for Sprout's panel: kicker, headline, a goal-fit ribbon, a drop-cap dek,
// framed panels (green on your goals, amber neutral, red away) and the cast. Same layout as the demo mockup.
import type { DaySegment } from "@/lib/types";
import type { StoryDay } from "./types";

const BORDER: Record<DaySegment["goalFit"], string> = { 1: "#4f9a4a", 0: "#e0a12b", [-1]: "#d0453a" };

export function goalFitPercent(day: StoryDay) {
  const n = day.segments.length;
  return n ? Math.round((day.segments.reduce((a, s) => a + (s.goalFit + 1) / 2, 0) / n) * 100) : 0;
}

export function Magazine({ day, animate = false }: { day: StoryDay; animate?: boolean }) {
  // Lead with the strongest moment, then keep the rest in time order.
  const leadIdx = Math.max(0, day.segments.findIndex((s) => s.goalFit === 1 && s.people.length));
  const lead = day.segments[leadIdx];
  const rest = day.segments.filter((_, i) => i !== leadIdx).slice(0, 4);
  const people = [...new Set(day.segments.flatMap((s) => s.people))];
  const places = [...new Set(day.segments.map((s) => s.place).filter(Boolean))].slice(0, 3);
  const talk = day.segments.find((s) => s.conversation)?.conversation;
  const date = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const pop = (n: number) => (animate ? { animation: `popIn .4s cubic-bezier(.2,.9,.25,1.2) ${0.1 * n}s both` } : undefined);

  return (
    <article className="flex flex-col gap-2.5 rounded-[11px] bg-[#fffdf8] p-4 shadow-[0_6px_20px_rgba(0,0,0,.12)]">
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b877f]">
        <span>Nomi Daily · {date}</span>
        <span>Goal fit {goalFitPercent(day)}%</span>
      </div>
      <h2 className="font-serif text-[26px] leading-[1.05] tracking-[-0.01em]">{day.headline ?? "Your day, drawn"}</h2>
      <div className="flex h-1.5 overflow-hidden rounded-full">
        {day.segments.map((s) => (
          <i key={s.id} className="flex-1" style={{ background: BORDER[s.goalFit] }} />
        ))}
      </div>
      <p className="text-[12.5px] leading-snug text-[#4a4843] first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-[40px] first-letter:font-medium first-letter:leading-[0.8]">
        {day.summary}
      </p>
      {lead && (
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-1.5" style={{ gridAutoRows: "minmax(78px, auto)" }}>
          {[lead, ...rest].map((s, n) => (
            <div
              key={s.id}
              className={`relative flex flex-col justify-end gap-0.5 rounded-lg border-[3.5px] p-2 pt-9 ${n === 0 ? "row-span-2 bg-[#e9f3e2] pt-14" : "bg-[#f4efe6]"}`}
              style={{ borderColor: BORDER[s.goalFit], ...pop(n) }}
            >
              <span className={`absolute left-2 top-1.5 ${n === 0 ? "text-[40px]" : "text-[26px]"}`}>{s.emoji}</span>
              <b className="font-serif text-[13px] leading-tight">{s.activity}</b>
              <small className="line-clamp-2 text-[10.5px] leading-tight text-[#6d6a64]">{n === 0 ? (s.conversation ?? s.why) : s.place || s.why}</small>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-[#ebe5da] pt-1.5 text-[11px] text-[#6d6a64]">
        {people.length > 0 && (
          <span>
            <b className="font-semibold text-[#1d1c1a]">Cast</b> {people.join(", ")}
          </span>
        )}
        {places.length > 0 && (
          <span>
            <b className="font-semibold text-[#1d1c1a]">Places</b> {places.join(", ")}
          </span>
        )}
        {talk && (
          <span className="min-w-0 truncate">
            <b className="font-semibold text-[#1d1c1a]">Talked about</b> {talk}
          </span>
        )}
      </div>
    </article>
  );
}
