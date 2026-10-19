// Today's check-in: talk (the big mic) or type what happened, with the day's calendar as a starting point.
// In the desktop app the mic records audio and /api/transcribe turns it into text; in a plain browser it
// uses live speech recognition when there is one.
import { useEffect, useRef, useState } from "react";
import { clock, type ContextItem } from "./context";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined" || window.nomi) return null; // Electron has the API but no speech service behind it
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

type MicState = "idle" | "listening" | "transcribing";

export function Composer({
  text,
  onText,
  onGenerate,
  loading,
  calendar = [],
}: {
  text: string;
  onText: (t: string) => void;
  onGenerate: () => void;
  loading: boolean;
  calendar?: ContextItem[];
}) {
  const [mic, setMic] = useState<MicState>("idle");
  const [interim, setInterim] = useState("");
  const [note, setNote] = useState("");
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const base = useRef("");
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(
    () => () => {
      rec.current?.stop();
      recorder.current?.stop();
    },
    [],
  );

  const append = (t: string) => {
    const cur = textRef.current.trimEnd();
    onText(cur ? `${cur} ${t.trim()}` : t.trim());
  };

  async function record() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setMic("transcribing");
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: new Blob(chunks, { type: r.mimeType || "audio/webm" }) });
          const out = (await res.json()) as { text: string; demo?: boolean };
          if (out.text) append(out.text);
          setNote(out.demo ? "No OpenAI key is set, so Sprout filled in a sample of what you might say." : "");
        } catch {
          setNote("Sprout couldn't hear that one. Try again, or type it.");
        } finally {
          setMic("idle");
        }
      };
      recorder.current = r;
      r.start();
      setMic("listening");
      setNote("");
    } catch {
      setNote("Sprout can't reach a microphone, so type it instead.");
    }
  }

  function toggleMic() {
    if (mic === "listening") {
      rec.current?.stop();
      recorder.current?.stop();
      return;
    }
    if (mic === "transcribing") return;
    const r = getRecognition();
    if (!r) return record();
    base.current = text ? text.trimEnd() + " " : "";
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let finals = "";
      let live = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript;
        else live += res[0].transcript;
      }
      onText(base.current + finals);
      setInterim(live);
    };
    r.onend = () => {
      setMic("idle");
      setInterim("");
    };
    r.onerror = () => setMic("idle");
    rec.current = r;
    r.start();
    setMic("listening");
  }

  const events = calendar.filter((i) => i.kind === "calendar");
  const label = mic === "listening" ? "Listening… tap to stop" : mic === "transcribing" ? "Writing it down…" : text ? "Tap to add more" : "Tap and tell Sprout about today";

  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-500">Your day so far · tap to start a line</p>
          <ol className="relative space-y-1.5 border-l-2 border-dashed border-stone-300 pl-4">
            {events.map((e, n) => (
              <li key={n} className="relative">
                <span className="absolute -left-[22px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500 ring-1 ring-red-500" />
                <button
                  onClick={() => append(`At ${e.title}${e.time ? ` (${clock(e.time)})` : ""}, `)}
                  className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-white"
                >
                  <span className="w-16 flex-none text-xs tabular-nums text-stone-400">{e.time ? clock(e.time) : ""}</span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-2xl border-2 border-stone-900 bg-white p-4 shadow-[4px_4px_0_#1c1917]">
        <p className="font-serif text-xl">How did today go?</p>
        <div className="my-4 flex flex-col items-center gap-2">
          <button
            onClick={toggleMic}
            aria-pressed={mic === "listening"}
            aria-label={label}
            className={`relative flex h-20 w-20 items-center justify-center rounded-full text-3xl transition ${
              mic === "listening" ? "scale-105 bg-rose-500 text-white" : mic === "transcribing" ? "bg-amber-300" : "bg-stone-900 text-white hover:scale-105"
            }`}
          >
            {mic === "listening" && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-40" />
                <span className="absolute -inset-2 animate-pulse rounded-full border-2 border-rose-300" />
              </>
            )}
            <span className="relative">{mic === "transcribing" ? "✍️" : "🎙️"}</span>
          </button>
          <p className="text-sm text-stone-600">{label}</p>
        </div>
        <textarea
          id="checkin-text"
          className="h-28 w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-stone-400"
          value={text + (interim ? (text ? " " : "") + interim : "")}
          onChange={(e) => onText(e.target.value)}
          readOnly={mic === "listening"}
          placeholder="Or type it: worked from home all morning, then the AI meetup at 6, met Priya who's building voice agents…"
        />
        {note && <p className="mt-1 text-xs text-stone-500">{note}</p>}
        <button
          onClick={onGenerate}
          disabled={loading || !text.trim() || mic !== "idle"}
          className="mt-3 w-full rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {loading ? "Sprout is drawing your day…" : "✦ Make my storyboard"}
        </button>
      </div>
    </div>
  );
}
