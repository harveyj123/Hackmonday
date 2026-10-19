import { test } from "node:test";
import assert from "node:assert/strict";
import { detectBlocker, isAllowedUrl, registrableDomain, SubmitLimiter } from "../../main/browser/guards.ts";

test("registrableDomain keeps the last two labels and folds Luma's two hosts", () => {
  assert.equal(registrableDomain("secure.meetup.com"), "meetup.com");
  assert.equal(registrableDomain("www.eventbrite.com"), "eventbrite.com");
  assert.equal(registrableDomain("lu.ma"), "luma.com");
  assert.equal(registrableDomain("luma.com"), "luma.com");
});

test("domain lock: same registrable domain and about:blank pass; anything else fails", () => {
  const opp = "https://luma.com/12t5e4lc";
  assert.equal(isAllowedUrl(opp, "https://luma.com/12t5e4lc?step=2"), true);
  assert.equal(isAllowedUrl(opp, "https://lu.ma/signin"), true);
  assert.equal(isAllowedUrl(opp, "https://api.luma.com/event/register"), true);
  assert.equal(isAllowedUrl(opp, "about:blank#nomi-job1"), true);
  assert.equal(isAllowedUrl(opp, "https://evil.example/luma.com"), false);
  assert.equal(isAllowedUrl(opp, "https://luma.com.evil.example/"), false);
  assert.equal(isAllowedUrl(opp, "javascript:alert(1)"), false);
  assert.equal(isAllowedUrl(opp, "file:///C:/Windows/win.ini"), false);
  assert.equal(isAllowedUrl(opp, "not a url"), false);
});

test("domain lock allows file:// only when the opportunity itself is a local fixture", () => {
  assert.equal(isAllowedUrl("file:///C:/Nomi/main/browser/fixtures/luma-like.html", "file:///C:/Nomi/main/browser/fixtures/luma-like.html#done"), true);
});

test("detectBlocker finds password fields", () => {
  assert.equal(detectBlocker('<form><input type="password" name="pw"></form>'), "password");
  assert.equal(detectBlocker("<input type='PASSWORD'>"), "password");
});

test("detectBlocker finds payment fields", () => {
  assert.equal(detectBlocker('<input autocomplete="cc-number">'), "payment");
  assert.equal(detectBlocker('<label>Card number</label><input name="cardnumber">'), "payment");
  assert.equal(detectBlocker("<label>CVC</label><input>"), "payment");
  assert.equal(detectBlocker('<iframe src="https://js.stripe.com/v3/elements-inner-card.html"></iframe>'), "payment");
});

test("detectBlocker finds CAPTCHAs", () => {
  assert.equal(detectBlocker('<div class="g-recaptcha" data-sitekey="x"></div>'), "captcha");
  assert.equal(detectBlocker('<div class="h-captcha"></div>'), "captcha");
  assert.equal(detectBlocker('<div class="cf-turnstile"></div>'), "captcha");
  assert.equal(detectBlocker("<p>Please complete the CAPTCHA</p>"), "captcha");
});

test("detectBlocker finds ID and phone verification asks", () => {
  assert.equal(detectBlocker("<label>Passport number</label><input>"), "id");
  assert.equal(detectBlocker("<label>Social Security Number</label><input>"), "id");
  assert.equal(detectBlocker("<p>Enter the verification code we sent to your phone</p><input>"), "phone_verification");
});

test("detectBlocker passes an ordinary registration form", () => {
  const html = `<form><label>Name</label><input name="name"><label>Email</label><input type="email" name="email">
    <label>What are you building?</label><textarea></textarea><button>Request to join</button></form>`;
  assert.equal(detectBlocker(html), null);
});

test("SubmitLimiter allows one submit per site per minute", () => {
  const limit = new SubmitLimiter(60_000);
  assert.equal(limit.check("luma.com", 0), 0);
  limit.record("luma.com", 0);
  assert.equal(limit.check("luma.com", 30_000), 30_000);
  assert.equal(limit.check("meetup.com", 30_000), 0);
  assert.equal(limit.check("luma.com", 60_000), 0);
});
