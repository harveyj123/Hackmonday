// ActEvent step stream -> BotTask.milestones (Open → Sign-in → Fill → Review → Submit → Confirmed).
import type { MilestoneStatus } from "../../lib/types.ts";
import type { ActEvent, StepId } from "./types.ts";

const ORDER: [StepId, string][] = [
  ["open", "Open"], ["check_login", "Sign-in"], ["fill", "Fill"],
  ["review", "Review"], ["submit", "Submit"], ["confirm", "Confirmed"],
];

// The latest event per step wins. A failed step stays "active" so the bar shows where it stopped.
export function milestones(events: ActEvent[]): { label: string; status: MilestoneStatus }[] {
  const latest = new Map<StepId, "active" | "done" | "failed">();
  for (const e of events) if (e.type === "step") latest.set(e.step, e.status);
  const finished = events.some((e) => e.type === "done" && (e.outcome === "submitted" || e.outcome === "pending_approval"));
  return ORDER.map(([id, label]) => {
    const s = latest.get(id);
    // Recipes may skip a step (no sign-in check needed); a finished submit means every bar is done.
    const status: MilestoneStatus = s === "done" || finished ? "done" : s ? "active" : "todo";
    return { label, status };
  });
}
