# Demo runbook: discovery + browser actions (Joey)

Branch `bots/browser-state`, which also contains all the discovery work. Run from the repo root. Needs `PARALLEL_API_KEY` in `.env.local`.

## 1. Parallel finds real rooms (live, about 1 s)

```bash
node scripts/discover.ts --area career --goal "become part of the SF AI founder scene"
```

Say: "That's Parallel Search on the live web: real Luma and Meetup pages, deduped, every card cited."

**Wifi backup.** Replays the last results in a few ms; the health entry holds the curated climbing gyms:

```bash
NOMI_DISCOVERY_MODE=cache node scripts/discover.ts --area career --goal "become part of the SF AI founder scene"
NOMI_DISCOVERY_MODE=cache node scripts/discover.ts --area health --goal "climb twice a week"
```

## 2. Nomi gets you in (Nomi browser window, local Luma-style page)

```bash
npx electron main/browser/try.ts --url=file:///C:/Users/JoeyWu/Nomi/main/browser/fixtures/luma-like.html --recipe=luma
```

The "Nomi is browsing" window opens and fills name, email and two answers, then stops at review. The screenshot is saved to `spikes/try-review.png`; that's the review card. Add `--submit` to show it reads "Pending approval".

Safety, one line each:
- `...luma-like.html?password` or `?payment` → `needs_manual`: Nomi never types passwords or card details.
- `?registered` → `already_registered`, and nothing gets clicked.
- On a real site, `--submit` waits until you type SUBMIT. Nothing is sent without the user.

## Gotchas

- Use `--flag=value` with `npx electron`. Electron exits silently when a URL argument is followed by `--flag value`.
- Health in live mode is noisy until a model key is set (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). Use cache mode for health.
- Not in the app UI yet: the IPC bridge (B3) and chat cards (B7) wait on the Electron port.
