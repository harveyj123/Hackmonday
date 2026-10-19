// Owned by Bots. Keeps live calls stage-safe: a time limit on every model or search call, and the last
// good live answer saved to disk so a flaky venue network still shows real results from earlier.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[live] ${label} took over ${ms}ms, using the fallback`);
      resolve(null);
    }, ms);
  });
  try {
    return await Promise.race([work.catch((e) => {
      console.warn(`[live] ${label} failed:`, e instanceof Error ? e.message : e);
      return null;
    }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const file = () => path.join(app.getPath("userData"), "nomi-live-cache.json");
let store: Record<string, unknown> | null = null;

function load(): Record<string, unknown> {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(file(), "utf8")) as Record<string, unknown>;
  } catch {
    store = {};
  }
  return store;
}

export function cached<T>(key: string): T | undefined {
  return load()[key] as T | undefined;
}

export function saveCached(key: string, value: unknown) {
  const s = load();
  s[key] = value;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(s));
  } catch (e) {
    console.warn("[live] could not save cache", e);
  }
}
