# Nomi

Nomi is an open-source personal agent that reads your day, sees which people, places and communities push you toward your goals, and then goes out on the live web and into your inbox to rebuild that environment for you.

- **Nomi Daily** lives in Sprout, the desktop pet. Click it to check in with your Mac's calendar as context, get a magazine-style storyboard with green, amber and red goal frames, and save plans ("I want to try Sightglass Saturday") that Sprout reminds you about on the day.
- **Nomi Bots**: friends that act. Parallel finds events, people and spaces, an open-source model decides, and after you approve it holds the time in Apple Calendar. Composio host emails come next.

Built with [Cline](https://cline.bot), [Parallel](https://docs.parallel.ai) and an open-source model (Composio next), for the Cline x Composio x Parallel Open Source AI Week hackathon.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: without keys everything runs on mock data
npm run desktop   # or `npm run dev` to rebuild on save
```

Nomi is a desktop app built on Electron. Sprout lives in the corner of your screen: drag it anywhere, click it to open Nomi Daily. The main window is Nomi Bots, opened from Sprout's panel, the tray or the dock.

- The check-in starts from today's Apple Calendar events. macOS asks once to let Nomi use Calendar. Each calendar takes about a second to search, so set `NOMI_CALENDARS="Nomi Demo"` (comma-separated) to read only those. If Calendar can't be read, Today says so rather than showing made-up events. Set `NOMI_DEMO_CALENDAR=1` to use a demo feed with the same events every run (also what you get off a Mac).
- Sprout has health. Going through with a plan ("On my way") makes it grow, skipping it ("Not today") makes it wilt, and each day's storyboard nudges it up or down. Days shows Sprout's growth across your days.
- Voice check-ins record from the mic and transcribe with `OPENAI_API_KEY` (`TRANSCRIBE_MODEL`, default whisper-1), or on the Mac itself with Whisper: run `npm run voice:setup` once (Homebrew's whisper-cpp plus a 140 MB English model in `~/.nomi`). With neither, Sprout asks you to type.
- Demo controls: right-click Sprout (or use the tray menu), or press ⌥⌘ and a number with any app in front.
  - ⌥⌘1 asks the bots for a suggestion.
  - ⌥⌘2 skips to the next plan's day. Today's storyboard moves into Days, Sprout says good morning, and that day's plan nudge pops so you can show On my way or Not today.
  - ⌥⌘3 pops the reminder for your next plan right away.
  - ⌥⌘0 starts over: no check-ins, plans or health changes, back to the first day.

## Layout

```
electron/main.ts        Electron main process: windows, tray, serves /api/* on app://nomi
electron/api/daily.ts   day text + Mac context -> DayEntry (open model)
electron/api/plans.ts   plans pulled from a check-in, and Sprout's nudge on the day
electron/api/context.ts the day's Mac context (demo feed or Apple Calendar)
electron/api/transcribe.ts voice check-in audio -> text
electron/api/agent.ts   one bot turn (Parallel + open model + calendar hold)
src/App.tsx             main window: Nomi Bots, receives storyboard hand-offs
src/PetWindow.tsx       Sprout's always-on-top window: the pet, the Daily panel, plan nudges
features/daily          Daily panel (Today, Plans, Days), storyboard, Sprout, plans
features/bots           bot grid, iMessage-style chat, milestone bars
lib/types.ts            shared contracts
lib/llm.ts              OpenAI-compatible client for the open model
lib/parallel.ts         Parallel search / findall / task
lib/calendar.ts         Apple Calendar .ics invites (served by electron/api/ics.ts)
lib/composio.ts         later: Gmail and LinkedIn actions
```

See [docs/PLAN.md](docs/PLAN.md) for the scope and demo script, and [docs/WORKFLOW.md](docs/WORKFLOW.md) for how the team splits the work.

## License

MIT
