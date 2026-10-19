# Nomi

Nomi is an open-source personal agent that reads your day, sees which people, places and communities push you toward your goals, and then goes out on the live web and into your inbox to rebuild that environment for you.

- **Nomi Daily**: tell the Nomi pet about your day and get a magazine-style storyboard with green, amber and red goal frames.
- **Nomi Bots**: friends that act. Parallel finds events, people and spaces, an open-source model decides, and Composio emails hosts and holds the time on your calendar, after you approve.

Built with [Cline](https://cline.bot), [Composio](https://docs.composio.dev), [Parallel](https://docs.parallel.ai) and an open-source model, for the Cline x Composio x Parallel Open Source AI Week hackathon.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: without keys everything runs on mock data
npm run dev
```

## Layout

```
app/page.tsx            shell + Daily/Bots toggle + hand-off
app/api/daily           day text -> DayEntry (open model)
app/api/agent           one bot turn (Parallel + open model + Composio)
features/daily          timeline, storyboard, pet
features/bots           bot grid, iMessage-style chat, milestone bars
lib/types.ts            shared contracts
lib/llm.ts              OpenAI-compatible client for the open model
lib/parallel.ts         Parallel search / findall / task
lib/composio.ts         Gmail, Calendar, LinkedIn actions
```

See [docs/PLAN.md](docs/PLAN.md) for the scope and demo script, and [docs/WORKFLOW.md](docs/WORKFLOW.md) for how the team splits the work.

## License

MIT
