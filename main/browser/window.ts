// The visible "Nomi is browsing" window. One window, reused per job; logins live in its partition.
import { app, BrowserWindow, session } from "electron";
import { cdpSwitches, jobMarker, nomiWebPreferences, PARTITION, SIGN_IN_URLS, WINDOW_TITLE, type SignInSite } from "./policy.ts";

let win: BrowserWindow | null = null;
let signingIn = false;

// Call before app ready (from the main entry, pending port). Returns the port, or null when off.
export function enableCdp(env: Record<string, string | undefined> = process.env): string | null {
  const switches = cdpSwitches(env);
  for (const [name, value] of switches) app.commandLine.appendSwitch(name, value);
  return switches[0]?.[1] ?? null;
}

// Untrusted sites get no permissions and no downloads. Popups only while the user signs in by hand
// (e.g. "Continue with Google"); during a job, links that open windows are refused.
function lockDownSession(): void {
  const s = session.fromPartition(PARTITION);
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.on("will-download", (e) => e.preventDefault());
}

export function nomiWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) return win;
  lockDownSession();
  win = new BrowserWindow({ width: 1000, height: 860, title: WINDOW_TITLE, show: true, webPreferences: nomiWebPreferences() });
  // Pages set their own <title>; keep the label so it's always clear Nomi is driving.
  win.on("page-title-updated", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => (signingIn ? { action: "allow" } : { action: "deny" }));
  // Sites' "leave this page?" handlers would otherwise block closing the window and quitting the app.
  win.webContents.on("will-prevent-unload", (e) => e.preventDefault());
  win.on("closed", () => { win = null; });
  return win;
}

// Opens the site's login page in the Nomi window. The user types their own password there.
export async function signIn(site: SignInSite): Promise<void> {
  const w = nomiWindow();
  signingIn = true;
  w.show();
  w.focus();
  await w.loadURL(SIGN_IN_URLS[site]);
}

// Loads the job's marker page and returns its URL for findPage(); ends any sign-in popup allowance.
export async function openJobPage(jobId: string): Promise<string> {
  signingIn = false;
  const w = nomiWindow();
  w.show();
  const marker = jobMarker(jobId);
  await w.loadURL(marker);
  return marker;
}

// Writes cookies to disk now; Electron otherwise flushes on its own schedule.
export async function flushLogins(): Promise<void> {
  await session.fromPartition(PARTITION).cookies.flushStore();
}
