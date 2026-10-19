# Team workflow (2 people, 3.5 hours)

## Who owns what

| Area | Owner | Files |
|---|---|---|
| Nomi Daily + pet | Harvey | `features/daily/`, `app/api/daily/` |
| Nomi Bots | Teammate | `features/bots/`, `app/api/agent/`, `lib/parallel.ts`, `lib/calendar.ts`, `app/api/ics/`, `data/bots.ts` (and `lib/composio.ts` later) |
| Shared | Both, ask first | `lib/types.ts`, `lib/llm.ts`, `app/page.tsx`, `components/` |

The only link between the halves is the `ActionItem` hand-off in `lib/types.ts`: Daily calls `onHandoff(item)`, the shell switches to Bots, and the bot named in `item.botId` opens with that item as its first message. As long as that type holds, neither person blocks the other.

Both routes fall back to mock data when keys are missing, so each half runs on its own from minute one.

## Branches

- `main` always builds and runs. It's what you demo.
- Work on `daily/<thing>` or `bots/<thing>` branches, one per sitting.
- Merge to `main` at each checkpoint with a quick PR (or a direct fast-forward if you're both in the room). Run `npm run typecheck` first.
- Changing `lib/types.ts`: say it out loud, make it a tiny separate commit, merge it to `main` first, and the other person pulls.

## Checkpoints

| Time | Merge to main |
|---|---|
| 12:15 | Keys in `.env.local`, both halves run on mocks, types frozen |
| 1:15 | Daily: real LLM storyboard. Bots: Scene Scout with real Parallel search |
| 2:00 | Daily: pet moods + hand-off chips. Bots: Approve → Apple Calendar .ics hold |
| 2:40 | Integration: full happy path from pet to an event in Apple Calendar, then Third Place |
| 3:00 | Code freeze. Record backup video, finish README, submit by 3:15 |

## Keys

Copy `.env.example` to `.env.local` and fill it in on each laptop. `.env*` is gitignored. Share keys in person or by a password manager, never in the repo or a chat.

## Desktop app

`npm run desktop` opens Nomi as an Electron app: the Next.js app in a main window plus Sprout, a small always-on-top pet in the bottom-right corner that opens the Daily check-in when clicked. It reuses a running `npm run dev` or starts one. Desktop-only code lives in `desktop/` (see `desktop/README.md`), so it doesn't touch `features/`.
