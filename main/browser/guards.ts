// Safety guards for browser jobs: domain lock, stop-and-hand-back detection, submit rate limit.

// Last two labels is enough for the demo sites (no co.uk-style suffixes); Luma's two hosts are one site.
export function registrableDomain(host: string): string {
  const d = host.toLowerCase().split(".").slice(-2).join(".");
  return d === "lu.ma" ? "luma.com" : d;
}

// A job may only navigate within the opportunity's site. about:blank is the page we start on
// to find our own tab over CDP; file:// is allowed only for local fixture runs.
export function isAllowedUrl(opportunityUrl: string, target: string): boolean {
  let t: URL;
  let o: URL;
  try { t = new URL(target); o = new URL(opportunityUrl); } catch { return false; }
  if (t.protocol === "about:") return t.pathname === "blank";
  if (o.protocol === "file:") return t.protocol === "file:";
  if (t.protocol !== "https:" && t.protocol !== "http:") return false;
  return registrableDomain(t.hostname) === registrableDomain(o.hostname);
}

export type Blocker = "password" | "payment" | "id" | "phone_verification" | "captcha";

// Any match stops the job; the first match only decides which reason the user sees.
const BLOCKERS: [Blocker, RegExp][] = [
  ["captcha", /g-recaptcha|h-captcha|cf-turnstile|\bcaptcha\b/i],
  ["password", /<input[^>]*type\s*=\s*["']?password/i],
  ["payment", /autocomplete\s*=\s*["']?cc-|card\s*number|cardnumber|\bcvc\b|\bcvv\b|expiry date|js\.stripe\.com|checkout\.stripe\.com|paypal\.com\/sdk/i],
  ["id", /passport|driver'?s licen[cs]e|social security|\bssn\b|national id/i],
  ["phone_verification", /verification code[^<]{0,80}(phone|sms|text)|(phone|sms|text)[^<]{0,80}verification code/i],
];

// Nomi never types passwords, payment or ID details and never solves CAPTCHAs: any of these hands back.
export function detectBlocker(html: string): Blocker | null {
  for (const [kind, re] of BLOCKERS) if (re.test(html)) return kind;
  return null;
}

// At most one submit per site per window; check() returns how long to wait (0 = go).
export class SubmitLimiter {
  private last = new Map<string, number>();
  private windowMs: number;
  constructor(windowMs = 60_000) {
    this.windowMs = windowMs;
  }
  check(site: string, nowMs: number): number {
    const prev = this.last.get(site);
    return prev === undefined ? 0 : Math.max(0, prev + this.windowMs - nowMs);
  }
  record(site: string, nowMs: number): void {
    this.last.set(site, nowMs);
  }
}
