// Run one browser job in Electron, no chat UI:
//   npx electron main/browser/try.ts --url=file:///…/luma-like.html --recipe=luma [--submit]
//   npx electron main/browser/try.ts --url=https://luma.com/<team-event> --action=request [--submit]
// Use --flag=value: Electron silently exits when a URL argument is followed by "--flag value".
// Stops at review and saves the screenshot. --submit on a real site asks you to type SUBMIT in this
// terminal first; nothing else can press it. (Becomes `npm run browser:try` once the port wires it up.)
import { app } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createJobManager } from "./index.ts";
import { mockRunner } from "./mock.ts";
import { playwrightRunner } from "./runner.ts";
import { connect, findPage } from "./cdp.ts";
import { enableCdp, openJobPage } from "./window.ts";
import { loadProfile } from "./profile.ts";
import { cannedAnswers } from "./answers.ts";
import { canonicalUrl, opportunityId } from "../discovery/normalize.ts";
import type { ActEvent, ActKind } from "./types.ts";

const { values } = parseArgs({
  args: process.argv.slice(process.argv.findIndex((a) => a.endsWith("try.ts")) + 1),
  options: {
    url: { type: "string" },
    action: { type: "string", default: "request" },
    recipe: { type: "string" },
    title: { type: "string", default: "Try run" },
    submit: { type: "boolean", default: false },
    out: { type: "string", default: join("spikes", "try-review.png") },
  },
});

if (!values.url) {
  console.error("usage: npx electron main/browser/try.ts --url=<event url> [--action=request|rsvp] [--recipe=luma] [--submit]");
  process.exit(2);
}

// Same folder the app will use, so a login from spikes/signin.ts carries over.
app.setPath("userData", join(app.getPath("appData"), "nomi"));
const port = process.env.NOMI_BROWSER_MODE === "mock" ? null : enableCdp();

let url: string;
try {
  url = canonicalUrl(values.url);
} catch {
  console.error(`not a URL: ${values.url}`);
  process.exit(2);
}
const isLocal = url.startsWith("file:");

async function confirmedByHuman(): Promise<boolean> {
  if (isLocal) return true; // a local fixture sends nothing anywhere
  if (!process.stdin.isTTY) {
    console.log("Not submitting: --submit on a real site needs you to type SUBMIT in an interactive terminal.");
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type SUBMIT to send this to ${new URL(url).hostname}: `);
  rl.close();
  return answer.trim() === "SUBMIT";
}

function print(e: ActEvent) {
  if (e.type === "step") console.log(`  [${e.step}] ${e.status} · ${e.label}`);
  else if (e.type === "review") {
    console.log(`  review · button "${e.submitLabel}"`);
    for (const f of e.fields) console.log(`    ${f.label}: ${f.value}`);
    writeFileSync(values.out!, Buffer.from(e.screenshot.split(",")[1], "base64"));
    console.log(`  screenshot saved to ${values.out}`);
  } else if (e.type === "done") console.log(`  DONE · ${e.outcome}${e.detail ? ` · ${e.detail}` : ""}`);
  else console.log(`  ERROR · ${e.message}`);
}

async function main() {
  await app.whenReady();
  const { profile, source } = loadProfile(".");
  if (source === "example") console.log("  (using profile.example.json; create profile.local.json with your details)");
  const runner = port === null
    ? mockRunner({ profile })
    : playwrightRunner({
        openPage: async (jobId) => findPage(await connect(port), await openJobPage(jobId)),
        profile,
        answer: async (qs) => cannedAnswers(qs, profile),
        forceRecipe: values.recipe,
      });
  const mgr = createJobManager({ runner, emit: print });
  const opportunity = {
    id: opportunityId(url), kind: "event" as const, source: "luma" as const, area: "career" as const,
    title: values.title!, url, joinMode: "request" as const, whyMatch: "", citations: [url], vetted: false,
  };
  const { jobId } = await mgr.prepare({ opportunity, action: values.action as ActKind });
  await mgr.settled(jobId);
  if (mgr.state(jobId) === "review") {
    if (values.submit && (await confirmedByHuman())) await mgr.confirm(jobId);
    else await mgr.cancel(jobId);
  }
  console.log(`  final state: ${mgr.state(jobId)}`);
}

main()
  .then(() => app.quit())
  .catch((e) => { console.error("TRY FAILED:", e); app.exit(1); });
