// The old Next.js API routes, now served by the Electron main process on the app:// scheme,
// so the renderer's fetch("/api/...") calls work unchanged and API keys never reach the renderer.
import * as agent from "./agent";
import * as daily from "./daily";
import * as analyze from "./analyze";
import * as ics from "./ics";

type Handler = (req: Request) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "POST /api/agent": agent.POST,
  "POST /api/daily": daily.POST,
  "POST /api/daily/analyze": analyze.POST,
  "GET /api/ics": ics.GET,
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
