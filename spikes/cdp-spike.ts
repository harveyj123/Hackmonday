// B0 spike: can Playwright (connectOverCDP) find and drive a page in our own Electron window?
// Run: npx electron spikes/cdp-spike.ts   → saves spikes/out.png showing the filled form.
// Never clicks the final submit. Only touches the local fixture page.
import { app, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { detectBlocker, isAllowedUrl } from "../main/browser/guards.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.NOMI_CDP_PORT || "9333";
const FIXTURE = pathToFileURL(join(here, "..", "main", "browser", "fixtures", "luma-like.html")).href;
const OUT = join(here, "out.png");

// Localhost only: the debugging port must never listen on the network.
app.commandLine.appendSwitch("remote-debugging-port", PORT);
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");

const t0 = performance.now();
const ms = () => `${Math.round(performance.now() - t0)} ms`;

async function run() {
  await app.whenReady();
  const jobId = randomUUID();
  const marker = `about:blank#nomi-${jobId}`;

  // Untrusted pages: sandboxed, isolated, no preload, persistent login partition.
  const win = new BrowserWindow({
    width: 900,
    height: 900,
    title: "Nomi is browsing",
    webPreferences: { partition: "persist:nomi-web", sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.on("page-title-updated", (e) => e.preventDefault()); // keep "Nomi is browsing" visible
  await win.loadURL(marker);
  console.log(`[${ms()}] window open on ${marker}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const pages = browser.contexts().flatMap((c) => c.pages());
  console.log(`[${ms()}] connected over CDP: ${browser.contexts().length} context(s), ${pages.length} page(s): ${pages.map((p) => p.url()).join(", ")}`);
  const page = pages.find((p) => p.url() === marker);
  if (!page) throw new Error("our #nomi-<jobId> page wasn't visible over CDP");
  console.log(`[${ms()}] found our page by marker`);

  if (!isAllowedUrl(FIXTURE, FIXTURE)) throw new Error("domain lock rejected the fixture");
  await page.goto(FIXTURE, { waitUntil: "domcontentloaded" });
  console.log(`[${ms()}] opened fixture; the Electron window shows ${win.webContents.getURL().split("/").pop()}`);

  await page.getByRole("button", { name: /request to join|register/i }).click();
  await page.getByLabel(/^name$/i).fill("Joey Wu");
  await page.getByLabel(/^email$/i).fill("joey@example.com");
  await page.getByLabel(/what are you building/i).fill("Nomi, a desktop companion that gets you into the right rooms.");
  await page.getByLabel(/why do you want to attend/i).fill("To meet other AI founders in SF.");
  console.log(`[${ms()}] filled name, email and 2 questions`);

  const blocker = detectBlocker(await page.content());
  console.log(`[${ms()}] guard check: ${blocker ?? "no password/payment/CAPTCHA"}`);

  const submit = page.getByRole("button", { name: /submit request/i });
  console.log(`[${ms()}] final submit visible: ${await submit.isVisible()} (not clicked)`);

  mkdirSync(here, { recursive: true });
  await page.screenshot({ path: OUT });
  console.log(`[${ms()}] screenshot saved to spikes/out.png`);

  // Disconnect only; closing the CDP browser would close the app's Chromium.
  await browser.close().catch(() => {});
}

run()
  .then(() => app.quit())
  .catch((e) => {
    console.error("SPIKE FAILED:", e);
    app.exit(1);
  });
