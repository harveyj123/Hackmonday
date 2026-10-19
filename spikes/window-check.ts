// B1 check, two processes:
//   npx electron spikes/window-check.ts write   → decoy app windows + Nomi window, marker lookup, Luma sign-in page, test cookie
//   npx electron spikes/window-check.ts read    → a fresh process finds the cookie (logins survive restart)
// Uses its own userData folder. Loads luma.com/signin read-only; never types or submits anything.
import { app, BrowserWindow, session } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { connect, findPage } from "../main/browser/cdp.ts";
import { PARTITION, WINDOW_TITLE } from "../main/browser/policy.ts";
import { enableCdp, flushLogins, nomiWindow, openJobPage, signIn } from "../main/browser/window.ts";

const phase = process.argv.at(-1);
const COOKIE = { url: "https://nomi.test", name: "nomi_b1_check" };

app.setPath("userData", join(app.getPath("appData"), "nomi-browser-check"));
const port = enableCdp();

async function write() {
  // Stand-ins for the app's main and Sprout windows, on the default session.
  const decoys = ["main", "sprout"].map((name) => {
    const w = new BrowserWindow({ width: 300, height: 200, show: false });
    w.loadURL(`data:text/html,<title>${name}</title>${name}`);
    return w;
  });
  const jobId = randomUUID();
  const marker = await openJobPage(jobId);
  const browser = await connect(port!);
  const all = browser.contexts().flatMap((c) => c.pages()).map((p) => p.url());
  const page = await findPage(browser, marker);
  console.log(`CDP sees ${all.length} pages (${all.map((u) => u.slice(0, 30)).join(" | ")}); picked ${page.url()}`);

  await signIn("luma");
  const w = nomiWindow();
  console.log(`sign-in page: ${w.webContents.getURL()} · window title: "${w.getTitle()}" (want "${WINDOW_TITLE}")`);
  console.log(`partition: ${w.webContents.session === session.fromPartition(PARTITION) ? PARTITION : "WRONG"} · sandboxed: ${(w.webContents as unknown as { getLastWebPreferences(): { sandbox?: boolean } | null }).getLastWebPreferences()?.sandbox}`);

  await session.fromPartition(PARTITION).cookies.set({ ...COOKIE, value: "kept", expirationDate: Date.now() / 1000 + 3600 });
  await flushLogins();
  console.log("test cookie written and flushed");
  decoys.forEach((d) => d.destroy());
}

async function read() {
  const found = await session.fromPartition(PARTITION).cookies.get(COOKIE);
  console.log(`after restart: cookie ${found.length ? `found (value "${found[0].value}")` : "MISSING"}`);
  await session.fromPartition(PARTITION).cookies.remove(COOKIE.url, COOKIE.name);
  if (!found.length) throw new Error("partition did not persist");
}

app.whenReady()
  .then(() => (phase === "read" ? read() : write()))
  .then(() => app.quit())
  .catch((e) => { console.error("CHECK FAILED:", e); app.exit(1); });
