# Nomi

Nomi is an open-source personal agent that reads your day, sees which people, places and communities push you toward your goals, and then goes out on the live web and into your inbox to rebuild that environment for you.

- **Nomi Daily**: tell the Nomi pet about your day and get a magazine-style storyboard with green, amber and red goal frames.
- **Nomi Bots**: friends that act. Parallel finds events, people and spaces, an open-source model decides, and after you approve it holds the time in Apple Calendar. Composio host emails come next.

Built with [Cline](https://cline.bot), [Parallel](https://docs.parallel.ai) and an open-source model (Composio next), for the Cline x Composio x Parallel Open Source AI Week hackathon.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: without keys everything runs on mock data
npm run desktop   # or `npm run dev` to rebuild on save
```

Nomi is a desktop app built on Electron. Sprout lives in the corner of your screen: drag it anywhere, click it to check in.

## Layout

```
electron/main.ts        Electron main process: windows, tray, serves /api/* on app://nomi
electron/api/daily.ts   day text -> DayEntry (open model)
electron/api/agent.ts   one bot turn (Parallel + open model + calendar hold)
src/App.tsx             renderer shell + Daily/Bots toggle + hand-off
src/PetWindow.tsx       Sprout's always-on-top desktop window
features/daily          timeline, storyboard, pet
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
