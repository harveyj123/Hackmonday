// Settings for the Nomi browser window and the CDP switch. No Electron import, so it unit-tests in plain Node.

export const PARTITION = "persist:nomi-web"; // "persist:" keeps cookies (logins) across restarts
export const WINDOW_TITLE = "Nomi is browsing";

export type SignInSite = "luma" | "meetup" | "partiful" | "eventbrite" | "linkedin";

// Checked Oct 19: each returns 200. The user signs in by hand; Nomi never types a password.
export const SIGN_IN_URLS: Record<SignInSite, string> = {
  luma: "https://luma.com/signin",
  meetup: "https://www.meetup.com/login/",
  partiful: "https://partiful.com/login",
  eventbrite: "https://www.eventbrite.com/signin/",
  linkedin: "https://www.linkedin.com/login",
};

// The pages are untrusted, so no Node, no preload and a sandboxed renderer.
export function nomiWebPreferences() {
  return { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true };
}

// Each job starts on this blank page so Playwright can tell our tab apart from the app's own windows.
export function jobMarker(jobId: string): string {
  return `about:blank#nomi-${jobId}`;
}

// Command-line switches to append before app ready. The debugging port exposes every app window to
// local processes, so it stays on 127.0.0.1 and can be turned off with NOMI_BROWSER=0.
export function cdpSwitches(env: Record<string, string | undefined>): [string, string][] {
  if (env.NOMI_BROWSER === "0") return [];
  const port = env.NOMI_CDP_PORT ?? "9333";
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
    throw new Error(`NOMI_CDP_PORT must be a port number from 1024 to 65535, got "${port}"`);
  }
  return [["remote-debugging-port", port], ["remote-debugging-address", "127.0.0.1"]];
}
