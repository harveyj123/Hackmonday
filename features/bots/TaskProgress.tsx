"use client";

import type { BotTask } from "@/lib/types";

export function TaskProgress({ task }: { task: BotTask }) {
  return (
    <div className="py-2">
      <p className="mb-2 text-xs font-medium">{task.title}</p>
      <div className="flex items-center">
        {task.milestones.map((m, i) => (
          <div key={m.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={`h-3 w-3 rounded-full ${m.status === "done" ? "bg-emerald-500" : m.status === "active" ? "animate-pulse bg-sky-500" : "bg-stone-300"}`}
              />
              <span className="mt-1 text-[10px] text-stone-500">{m.label}</span>
            </div>
            {i < task.milestones.length - 1 && (
              <div className={`mx-1 mb-4 h-0.5 flex-1 ${m.status === "done" ? "bg-emerald-500" : "bg-stone-300"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
