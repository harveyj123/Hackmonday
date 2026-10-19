// The user's details for forms. profile.local.json is gitignored; profile.example.json shows the shape.
// In the app this folder becomes userData (pending port); scripts use the repo root.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Profile = {
  name: string;
  email: string;
  linkedinUrl?: string;
  city?: string;
  oneLiner?: string;
  building?: string;
  interests?: string[];
};

export function loadProfile(dir = "."): { profile: Profile; source: "local" | "example" } {
  const local = join(dir, "profile.local.json");
  const source = existsSync(local) ? "local" : "example";
  const p = JSON.parse(readFileSync(source === "local" ? local : join(dir, "profile.example.json"), "utf8")) as Profile;
  if (typeof p.name !== "string" || !p.name.trim()) throw new Error("profile needs a name");
  if (typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error("profile needs a valid email");
  return { profile: p, source };
}
