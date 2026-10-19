// Composio actions (Gmail, Google Calendar, LinkedIn post). Owned by Bots.
// Docs: https://docs.composio.dev/docs/quickstart
// Plan: `npm i @composio/core`, create one session per user with composio.sessions.create(userId),
// hand session.tools() to the agent loop, and only run send/hold actions after the user taps Approve.

import type { PendingAction } from "./types";

export function composioConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

export async function runApprovedAction(action: PendingAction): Promise<{ ok: boolean; detail: string }> {
  if (!composioConfigured()) return { ok: true, detail: `(mock) ${action.summary}` };
  // TODO(bots): map action.kind to the Composio Gmail / Calendar / LinkedIn tool and execute it.
  throw new Error("Composio not wired yet");
}
