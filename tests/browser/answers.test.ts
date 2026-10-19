import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cannedAnswers } from "../../main/browser/answers.ts";
import { loadProfile, type Profile } from "../../main/browser/profile.ts";
import { pickRecipe } from "../../main/browser/recipes/index.ts";

const profile: Profile = {
  name: "Joey Wu",
  email: "joey@example.com",
  linkedinUrl: "https://www.linkedin.com/in/joey",
  city: "San Francisco",
  oneLiner: "AI engineer building Nomi, a desktop companion.",
  building: "Nomi: Parallel finds the right rooms, a model decides, and Nomi gets you in.",
  interests: ["AI agents", "climbing"],
};

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

test("canned answers map common Luma questions onto the profile", () => {
  const out = cannedAnswers(["What are you building?", "Why do you want to attend?", "LinkedIn profile", "What's your role or company?"], profile);
  assert.equal(out[0], profile.building);
  assert.match(out[1], /AI agents/);
  assert.equal(out[2], profile.linkedinUrl);
  assert.equal(out[3], profile.oneLiner);
});

test("canned answers are at most 2 sentences and never empty", () => {
  for (const a of cannedAnswers(["Anything else?", "How did you hear about us?", "What are you building?"], profile)) {
    assert.ok(a.trim().length > 0);
    assert.ok(sentences(a) <= 2, a);
  }
});

test("loadProfile reads profile.local.json when present, else the example, and says which", () => {
  const dir = mkdtempSync(join(tmpdir(), "nomi-profile-"));
  writeFileSync(join(dir, "profile.example.json"), JSON.stringify({ ...profile, name: "Your Name" }));
  assert.equal(loadProfile(dir).source, "example");
  assert.equal(loadProfile(dir).profile.name, "Your Name");
  writeFileSync(join(dir, "profile.local.json"), JSON.stringify(profile));
  assert.equal(loadProfile(dir).source, "local");
  assert.equal(loadProfile(dir).profile.name, "Joey Wu");
});

test("loadProfile rejects a profile without a name or a valid email", () => {
  const dir = mkdtempSync(join(tmpdir(), "nomi-profile-"));
  writeFileSync(join(dir, "profile.local.json"), JSON.stringify({ ...profile, email: "not-an-email" }));
  assert.throws(() => loadProfile(dir), /email/);
});

test("pickRecipe matches Luma hosts, and only forces a recipe for local fixture files", () => {
  assert.equal(pickRecipe("https://luma.com/12t5e4lc")?.id, "luma");
  assert.equal(pickRecipe("https://lu.ma/12t5e4lc")?.id, "luma");
  assert.equal(pickRecipe("https://meetup.com/x/events/1"), null);
  assert.equal(pickRecipe("https://evil.example/luma.com"), null);
  assert.equal(pickRecipe("file:///C:/Nomi/main/browser/fixtures/luma-like.html", "luma")?.id, "luma");
  assert.equal(pickRecipe("https://meetup.com/x", "luma"), null, "a forced recipe never overrides a real site");
});
