import { test } from "node:test";
import assert from "node:assert/strict";
import { cdpSwitches, jobMarker, nomiWebPreferences, PARTITION, SIGN_IN_URLS, WINDOW_TITLE } from "../../main/browser/policy.ts";
import { findPage } from "../../main/browser/cdp.ts";

test("the Nomi window is sandboxed, isolated, has no preload and uses the persistent partition", () => {
  const prefs = nomiWebPreferences();
  assert.deepEqual(prefs, { partition: "persist:nomi-web", sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
  assert.equal("preload" in prefs, false);
  assert.equal(PARTITION.startsWith("persist:"), true, "persist: makes logins survive a restart");
  assert.equal(WINDOW_TITLE, "Nomi is browsing");
});

test("sign-in pages are https pages on each site's own domain", () => {
  assert.deepEqual(Object.keys(SIGN_IN_URLS).sort(), ["eventbrite", "linkedin", "luma", "meetup", "partiful"]);
  for (const [site, url] of Object.entries(SIGN_IN_URLS)) {
    const u = new URL(url);
    assert.equal(u.protocol, "https:", site);
    assert.ok(u.hostname.endsWith(`${site}.com`), `${site}: ${u.hostname}`);
  }
});

test("CDP switches: localhost only, default port 9333, off with NOMI_BROWSER=0", () => {
  assert.deepEqual(cdpSwitches({}), [["remote-debugging-port", "9333"], ["remote-debugging-address", "127.0.0.1"]]);
  assert.deepEqual(cdpSwitches({ NOMI_CDP_PORT: "9444" })[0], ["remote-debugging-port", "9444"]);
  assert.deepEqual(cdpSwitches({ NOMI_BROWSER: "0" }), []);
  assert.throws(() => cdpSwitches({ NOMI_CDP_PORT: "80; rm -rf" }), /NOMI_CDP_PORT/);
  assert.throws(() => cdpSwitches({ NOMI_CDP_PORT: "70000" }), /NOMI_CDP_PORT/);
});

test("jobMarker is the about:blank page we look for over CDP", () => {
  assert.equal(jobMarker("abc"), "about:blank#nomi-abc");
});

// Shaped like playwright-core's Browser: contexts() → pages() → url().
const fakeBrowser = (urlsOverTime: string[][]) => {
  let tick = 0;
  return {
    contexts: () => {
      const urls = urlsOverTime[Math.min(tick++, urlsOverTime.length - 1)];
      return [{ pages: () => urls.map((u) => ({ url: () => u })) }];
    },
  };
};

test("findPage picks our marker page even with the main and Sprout windows open", async () => {
  const browser = fakeBrowser([["http://localhost:3000/", "file:///app/desktop/pet.html", "about:blank#nomi-job1"]]);
  const page = await findPage(browser, "about:blank#nomi-job1", { timeoutMs: 100, pollMs: 1 });
  assert.equal(page.url(), "about:blank#nomi-job1");
});

test("findPage waits for the page to appear, and never returns another window's page", async () => {
  const browser = fakeBrowser([["http://localhost:3000/"], ["http://localhost:3000/"], ["http://localhost:3000/", "about:blank#nomi-job2"]]);
  const page = await findPage(browser, "about:blank#nomi-job2", { timeoutMs: 500, pollMs: 1 });
  assert.equal(page.url(), "about:blank#nomi-job2");
  await assert.rejects(findPage(fakeBrowser([["http://localhost:3000/"]]), "about:blank#nomi-job3", { timeoutMs: 20, pollMs: 1 }), /not found/);
});
