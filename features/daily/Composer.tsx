"use client";

// Today's entry: type, or tap the mic and talk (browser speech recognition), then Generate.
import { useEffect, useRef, useState } from "react";

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
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function Composer({
  text,
  onText,
  onGenerate,
  loading,
}: {
  text: string;
  onText: (t: string) => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [noMic, setNoMic] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const base = useRef("");

  useEffect(() => () => rec.current?.stop(), []);

  function toggleMic() {
    if (recording) {
      rec.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) {
      setNoMic(true);
      return;
    }
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
      setRecording(false);
      setInterim("");
    };
    r.onerror = () => setRecording(false);
    rec.current = r;
    r.start();
    setRecording(true);
  }

  return (
    <div className="rounded-2xl border-2 border-stone-900 bg-white p-4 shadow-[4px_4px_0_#1c1917]">
      <p className="mb-2 font-serif text-lg">How did today go?</p>
      <div className="relative">
        <textarea
          className="h-32 w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-stone-400"
          value={text + (interim ? (text ? " " : "") + interim : "")}
          onChange={(e) => onText(e.target.value)}
          readOnly={recording}
          placeholder="Worked from my apartment all morning and felt stuck. Lunch alone. Went to an AI meetup at 6, met Priya who's building voice agents..."
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${recording ? "bg-rose-500 text-white" : "bg-stone-100 hover:bg-stone-200"}`}
          aria-pressed={recording}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-white" : "bg-rose-500"}`} />
          {recording ? "Listening… tap to stop" : "Tap to record"}
        </button>
        {noMic && <span className="text-xs text-stone-500">Voice isn't supported in this browser, so type it instead.</span>}
        <button
          onClick={onGenerate}
          disabled={loading || !text.trim()}
          className="ml-auto rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {loading ? "Drawing your day…" : "✦ Generate storyboard"}
        </button>
      </div>
    </div>
  );
}
