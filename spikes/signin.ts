// Manual sign-in for the Nomi browser: npx electron spikes/signin.ts luma
// Sign in by hand in the window, then close it. Run it again: the site should open already signed in.
// (Becomes `npm run browser:signin -- luma` once the port's main entry wires it up.)
import { app } from "electron";
import { SIGN_IN_URLS, type SignInSite } from "../main/browser/policy.ts";
import { flushLogins, nomiWindow, signIn } from "../main/browser/window.ts";
import { join } from "node:path";

const site = process.argv.at(-1) as SignInSite;
if (!(site in SIGN_IN_URLS)) {
  console.error(`usage: npx electron spikes/signin.ts <${Object.keys(SIGN_IN_URLS).join("|")}>`);
  process.exit(2);
}

// Same folder the app and try.ts use, so this login carries over.
app.setPath("userData", join(app.getPath("appData"), "nomi"));

app.whenReady().then(async () => {
  await signIn(site);
  console.log(`Sign in to ${site} in the "Nomi is browsing" window, then close it.`);
  nomiWindow().on("close", () => { void flushLogins(); });
});
app.on("window-all-closed", async () => {
  await flushLogins();
  app.quit();
});
