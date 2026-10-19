"use client";

import type { BotTask } from "@/lib/types";

export function TaskProgress({ task }: { task: BotTask }) {
  const completed = task.milestones.filter((milestone) => milestone.status === "done").length;

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-xs font-semibold text-neutral-800">{task.title}</p>
        <p className="shrink-0 text-[10px] font-medium text-neutral-400">{completed} of {task.milestones.length}</p>
      </div>
      <div
        className="relative mt-3 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${task.milestones.length}, minmax(0, 1fr))` }}
      >
        <span className="absolute left-[8%] right-[8%] top-[5px] h-px bg-neutral-200" aria-hidden="true" />
        {task.milestones.map((milestone) => (
          <div key={milestone.label} className="relative z-10 min-w-0 text-center">
            <span
              className={`mx-auto block h-[11px] w-[11px] rounded-full border-2 border-white ring-1 ${
                milestone.status === "done"
                  ? "bg-neutral-900 ring-neutral-900"
                  : milestone.status === "active"
                    ? "animate-pulse bg-blue-500 ring-blue-500"
                    : "bg-white ring-neutral-300"
              }`}
            />
            <span className={`mt-1.5 block truncate text-[10px] ${milestone.status === "active" ? "font-medium text-blue-600" : "text-neutral-400"}`}>
              {milestone.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
