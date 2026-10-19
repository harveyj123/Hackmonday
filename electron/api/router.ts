// The old Next.js API routes, now served by the Electron main process on the app:// scheme,
// so the renderer's fetch("/api/...") calls work unchanged and API keys never reach the renderer.
import * as agent from "./agent";
import * as daily from "./daily";
import * as analyze from "./analyze";
import * as ics from "./ics";
import * as context from "./context";
import * as plans from "./plans";
import * as transcribe from "./transcribe";
import * as memory from "./memory";
import * as triage from "./triage";
import * as suggestions from "./suggestions";
import * as live from "./live";

type Handler = (req: Request) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "POST /api/agent": agent.POST,
  "POST /api/daily": daily.POST,
  "POST /api/daily/analyze": analyze.POST,
  "GET /api/ics": ics.GET,
  "GET /api/context": context.GET,
  "POST /api/plans": plans.POST,
  "POST /api/plans/nudge": plans.NUDGE_POST,
  "POST /api/transcribe": transcribe.POST,
  "GET /api/memory": memory.GET,
  "POST /api/memory": memory.POST,
  "POST /api/route": triage.POST,
  "POST /api/suggestions": suggestions.POST,
  "POST /api/suggest": suggestions.SUGGEST_POST,
  "GET /api/bots/status": live.STATUS_GET,
};

export async function handleApi(req: Request): Promise<Response> {
  const route = ROUTES[`${req.method} ${new URL(req.url).pathname.replace(/\/$/, "")}`];
  if (!route) return new Response("Not found", { status: 404 });
  try {
    return await route(req);
  } catch (e) {
    console.error("[api]", req.method, req.url, e);
    return new Response(String(e), { status: 500 });
  }
}
