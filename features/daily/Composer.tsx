// Today's check-in: talk (the big mic) or type what happened, with the day's calendar as a starting point.
// In the desktop app the mic records audio and /api/transcribe turns it into text (OpenAI, or Whisper running
// on the Mac); in a plain browser it uses live speech recognition when there is one.
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

// 16-bit PCM WAV from mono float samples.
function wav(chunks: Float32Array[], rate: number) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, t: string) => [...t].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks)
    for (const v of c) {
      view.setInt16(o, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
      o += 2;
    }
  return new Blob([view], { type: "audio/wav" });
}

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
  const [picked, setPicked] = useState("");
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<{ stop: () => void } | null>(null);
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

  // Records 16 kHz mono WAV, which OpenAI and local Whisper both take as is.
  async function record() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const tap = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      tap.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(tap);
      tap.connect(ctx.destination);
      recorder.current = {
        stop: async () => {
          recorder.current = null;
          tap.disconnect();
          source.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          await ctx.close();
          setMic("transcribing");
          try {
            const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav(chunks, 16000) });
            const out = (await res.json()) as { text?: string; error?: string };
            if (out.text) append(out.text);
            setNote(out.error ?? (out.text ? "" : "Sprout didn't catch anything. Try again a little closer."));
          } catch {
            setNote("Sprout couldn't hear that one. Try again, or type it.");
          } finally {
            setMic("idle");
          }
        },
      };
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
  const cals = [...new Set(events.map((e) => e.calendar).filter(Boolean))];

  return (
    <div className="flex flex-col gap-3.5">
      {events.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="nd-label">From Apple Calendar{cals.length === 1 ? ` · ${cals[0]}` : ""}</span>
          {events.map((e, n) => (
            <button
              key={n}
              onClick={() => {
                setPicked(e.title);
                append(`At ${e.title}${e.time ? ` (${clock(e.time)})` : ""}, `);
              }}
              className={`-mx-2 flex items-center gap-2.5 rounded-md border px-2 py-1 text-left text-[13px] transition ${
                picked === e.title ? "border-[#1d1c1a] bg-white" : "border-transparent hover:bg-white"
              }`}
            >
              <i className="h-2.5 w-2.5 flex-none rounded-[3px] bg-[#ff3b30]" />
              <span className="min-w-0 truncate">{e.title}</span>
              <em className="ml-auto flex-none text-[12px] not-italic text-[#8b877f]">{e.time ? clock(e.time) : ""}</em>
            </button>
          ))}
        </div>
      )}

      <div className="nd-checkin flex flex-col gap-2.5 p-3.5">
        {mic === "listening" ? (
          <div className="flex items-center gap-2 text-[12.5px] text-[#b3261e]">
            <span className="nd-wave">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            Listening{picked ? ` · ${picked}` : ""}
          </div>
        ) : (
          <p className="font-serif text-[19px]">How did today go?</p>
        )}
        <textarea
          id="checkin-text"
          className="h-28 w-full resize-none rounded-lg bg-[#f6f5f2] p-2.5 text-[13px] text-[#3b3a36] outline-none placeholder:text-[#8b877f] focus:ring-1 focus:ring-stone-300"
          value={text + (interim ? (text ? " " : "") + interim : "")}
          onChange={(e) => onText(e.target.value)}
          readOnly={mic === "listening"}
          placeholder="Tap an event, then talk or type…"
        />
        {note && <p className="text-[11.5px] text-[#77736c]">{note}</p>}
        <div className="flex items-center justify-between gap-2">
          <button onClick={toggleMic} aria-pressed={mic === "listening"} aria-label={label} className={`nd-pill ${mic === "listening" ? "!bg-[#fde3e1] !text-[#b3261e]" : ""}`}>
            {mic === "listening" ? "🎙 Stop" : mic === "transcribing" ? "✍️ Writing it down…" : "🎙 Talk"}
          </button>
          <button onClick={onGenerate} disabled={loading || !text.trim() || mic !== "idle"} className="nd-pill dark">
            {loading ? "Drawing your day…" : "✦ Storyboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
