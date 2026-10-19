"use client";

export type Mode = "daily" | "bots";

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mx-auto flex w-fit rounded-full bg-stone-200 p-1 text-sm font-medium">
      {(["daily", "bots"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-full px-5 py-1.5 transition ${mode === m ? "bg-white shadow" : "text-stone-500"}`}
        >
          {m === "daily" ? "Nomi Daily" : "Nomi Bots"}
        </button>
      ))}
    </div>
  );
}
