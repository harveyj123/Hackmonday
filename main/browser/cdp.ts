// Playwright over CDP: attach to the app's own Chromium and find the Nomi window's page by its marker.
import { chromium, type Browser } from "playwright-core";

type PageLike = { url(): string };
type BrowserLike = { contexts(): { pages(): PageLike[] }[] };

let connection: Promise<Browser> | null = null;

// One shared connection. Never call browser.close() on it in the app: that closes Electron's Chromium.
export function connect(port: string | number): Promise<Browser> {
  connection ??= chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch((e) => {
    connection = null;
    throw e;
  });
  return connection;
}

// The page shows up over CDP a moment after loadURL; poll until it does. Only an exact marker match
// counts, so the main and Sprout windows are never touched.
export async function findPage<B extends BrowserLike>(
  browser: B,
  marker: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<ReturnType<ReturnType<B["contexts"]>[number]["pages"]>[number]> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5_000);
  for (;;) {
    const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url() === marker);
    if (page) return page as never;
    if (Date.now() >= deadline) throw new Error(`Nomi browser page ${marker} not found over CDP`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 50));
  }
}
