# Nomi

Nomi is an open-source desktop companion. Sprout, a little pet on your screen, hears about your day, Nomi shows which people, places and communities push you toward your goals, and Nomi bots go out on the live web to put the right rooms on your calendar.

- **Nomi Daily**: tell Sprout about your day (type or talk) and get a magazine-style storyboard with green, amber and red goal frames, plus analysis across a period.
- **Nomi Bots**: friends that act. Parallel finds events, people and spaces, an open-source model decides, and after you approve it holds the time in Apple Calendar. Composio host emails come next.

Built with [Cline](https://cline.bot) (it built the app and its API serves the model, with Kimi K3 as the open-weight option), [Parallel](https://docs.parallel.ai), and Composio next, for the Cline x Composio x Parallel Open Source AI Week hackathon.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: without keys everything runs on mock data
npm run desktop              # desktop app with Sprout always on top (or `npm run dev` for the browser)
```

Models: set `CLINE_API_KEY` and/or `OPENAI_API_KEY`. `LLM_PROVIDER` picks which goes first, the other is the fallback, then mocks.

## Layout

```
app/page.tsx            shell + Daily/Bots toggle + hand-off
app/api/daily           day text -> DayEntry (open model)
app/api/agent           one bot turn (Parallel + open model + calendar hold)
features/daily          timeline, storyboard, pet
features/bots           bot grid, iMessage-style chat, milestone bars
lib/types.ts            shared contracts
lib/llm.ts              OpenAI-compatible client for the open model
lib/parallel.ts         Parallel search / findall / task
lib/calendar.ts         Apple Calendar .ics invites (served by app/api/ics)
lib/composio.ts         later: Gmail and LinkedIn actions
```

See [docs/PLAN.md](docs/PLAN.md) for the scope and demo script, and [docs/WORKFLOW.md](docs/WORKFLOW.md) for how the team splits the work.

## License

MIT
