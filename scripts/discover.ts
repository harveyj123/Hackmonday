// CLI for discover(): node scripts/discover.ts --area career --goal "..." --city "San Francisco" --days 7
// Progress goes to stderr; results and a success-criteria summary go to stdout (--json for raw).
import { parseArgs } from "node:util";

// Keys live in .env.local (gitignored); without them discover() falls back to mock fixtures.
try { process.loadEnvFile(".env.local"); } catch {}

const { discover } = await import("../main/discovery/index.ts");
const { canonicalUrl, inWindow } = await import("../main/discovery/normalize.ts");
type Req = Parameters<typeof discover>[0];

const { values } = parseArgs({
  options: {
    area: { type: "string", default: "career" },
    goal: { type: "string" },
    context: { type: "string" },
    city: { type: "string", default: "San Francisco" },
    days: { type: "string", default: "7" },
    kinds: { type: "string" },
    limit: { type: "string" },
    vet: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
});

if (!values.goal) {
  console.error('usage: node scripts/discover.ts --area career --goal "become part of the SF AI founder scene" [--city "San Francisco"] [--days 7] [--kinds event,place] [--limit 5] [--json]');
  process.exit(2);
}
if (values.vet) console.error("note: --vet arrives with D6; ignoring it for now");

const req: Req = {
  area: values.area as Req["area"],
  goal: values.goal,
  context: values.context,
  city: values.city!,
  windowDays: Number(values.days),
  ...(values.kinds ? { kinds: values.kinds.split(",") as Req["kinds"] } : {}),
  ...(values.limit ? { limit: Number(values.limit) } : {}),
};

const res = await discover(req, (e) => {
  if (e.type === "progress") console.error(`  [${e.step}${e.done ? " ✓" : ""}] ${e.label}`);
});

if (values.json) {
  console.log(JSON.stringify(res, null, 2));
} else {
  console.log(`\nmode ${res.mode} · ${res.opportunities.length} results · ${res.tookMs} ms`);
  for (const w of res.warnings) console.log(`warning: ${w}`);
  res.opportunities.forEach((o, i) => {
    console.log(`\n${i + 1}. [${o.kind}/${o.source}] ${o.title}`);
    console.log(`   ${o.url}`);
    const facts = [o.start, o.location, o.host?.name].filter(Boolean).join(" · ");
    if (facts) console.log(`   ${facts}`);
    console.log(`   join: ${o.joinMode} · cites: ${o.citations.length} · vetted: ${o.vetted}`);
    console.log(`   why: ${o.whyMatch}`);
  });

  // The spec's success criteria 1-3, checked on this run.
  const urls = res.opportunities.map((o) => o.url);
  const now = new Date();
  const checks = [
    ["canonical URLs", urls.every((u) => u === canonicalUrl(u))],
    ["unique URLs", new Set(urls).size === urls.length],
    ["every card has title, joinMode, whyMatch, >= 1 citation", res.opportunities.every((o) => o.title && o.joinMode && o.whyMatch && o.citations.length > 0)],
    ["event starts inside the window", res.opportunities.every((o) => inWindow(o.start, now, req.windowDays, o.end))],
    ["<= 5 s", res.tookMs <= 5000],
  ] as const;
  console.log("");
  for (const [label, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${label}`);
}
