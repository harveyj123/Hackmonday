# Nomi: hackathon plan (Cline x Composio x Parallel)

**One-liner for judges:** Nomi is an open-source desktop companion. Sprout, a little pet on your screen, hears about your day, Nomi shows which people, places and communities push you toward your goals, and Nomi bots go out on the live web to put the right rooms on your calendar.

**Current decisions (Oct 19)**
- **Pure Electron app, no Next.js** (Harvey's call): a React renderer for the screens, and the Electron main process for the API work. There's a main Nomi window plus an always-on-top **Sprout** pet window. The "Nomi desktop app" thread owns the port, and the README has the run commands.
- **Sprout** is the pet and the Daily check-in (PR #2).
- **Nomi Daily** has a timeline, typed or voice entry, a magazine storyboard and period analysis (PR #3). It gets ported into the React renderer.
- **Models** come from two sides, Cline and OpenAI, with automatic fallback and then mocks.
- **Parallel** finds things and **Apple Calendar** (`.ics`) acts. **Composio is a later stretch.**
- Harvey owns Daily and a teammate owns Bots (see `docs/WORKFLOW.md`).

## 1. How each sponsor fits

| Sponsor | Role in Nomi | What it does in the demo |
|---|---|---|
| **Cline** | Builds Nomi, and powers its brain | We build the app with Cline. Its API (`CLINE_API_KEY`, Cline credits) also serves the model for Daily and Bots, defaulting to `anthropic/claude-sonnet-5.5`. For an open-weight brain, set `CLINE_MODEL=moonshotai/kimi-k3`. |
| **Parallel** | Nomi's eyes on the world | **Search API** (`/v1/search`, `fast` mode) limited to Luma, Partiful, Meetup and Eventbrite for events and spaces. **Task API** to enrich a hit (host, date, vibe, how to get in). Stretches: **FindAll** for entity lists, and **Monitor** for "new matching event" pings. |
| **Open-source models** | Swappable brain | Any open-weight model (Kimi K3 through Cline, or any OpenAI-compatible host through `OPENAI_BASE_URL`) slots in with no code change. Say it out loud in the pitch. |
| **Apple Calendar** | Nomi's hands, for now | Approving a plan makes the main process write an `.ics` invite and open it, which adds the event to Calendar, with no keys or login. |
| **Composio (later)** | More hands | Gmail to email hosts and LinkedIn to post ("Spotlight" bot). The toolkit can post to LinkedIn but not send DMs. Composio has a judge, so this is the highest-value stretch if there's time after 2:40. |

Pitch line: **Parallel finds it, the model decides, Nomi puts it on your calendar, and Cline built it all.**

**Constraints we design around**
- No public API registers you for someone else's Luma, Partiful or Meetup event. So Nomi holds the slot in Calendar and links to the event page to request the invite. Say "Nomi gets you in the room", not "Nomi registers you".
- Every outbound action sits behind a one-tap **Approve**.

## 2. Model setup (two-sided client, runs in the Electron main process)

- Two named sides: **cline** (`CLINE_API_KEY`, `CLINE_MODEL`) and **openai** (`OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL` for any compatible host). The older `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL` still work as a third **custom** side.
- `LLM_PROVIDER` picks which side goes first. `DAILY_LLM_PROVIDER` and `BOTS_LLM_PROVIDER` override that per feature, and the rest are the fallback. If every side fails or none is set, Nomi uses mocks. If one side runs out of credits, the demo keeps going.
- Keys live in `.env.local` and are read only by the main process, so they never reach the renderer.
- Daily defaults to Claude Sonnet 5.5 via Cline (about 2 to 5 seconds per call). Kimi K3 via Cline is the open-weight option.

## 3. What the app is

**Architecture (pure Electron)**
- **Main process:** windows, the tray, and all outside calls: the two-sided model client, Parallel search and task, and writing `.ics` invites. It exposes these to the renderer over IPC (what the Next `/api/daily`, `/api/agent` and `/api/ics` routes used to do).
- **Renderer (React):** the Daily and Bots screens and the toggle. It calls the main process through a small preload bridge, not over HTTP.
- **Sprout window:** transparent and always on top in the bottom-right of the screen. Click Sprout to open the Daily check-in, and drag to move it. Closing the main window keeps Sprout and the 🌱 tray icon, and you quit from the tray.
- The shared contracts (`ActionItem`, `DayEntry`, `ChatMessage`, `BotTask`) carry over unchanged, so the Daily → Bots hand-off works the same way.

**Sprout (PR #2)**
- Sprout is the face of Nomi. It asks "how'd today go?", its mood follows the day's goal fit (six animated moods), and it celebrates when a bot finishes a task.

**Nomi Daily (PR #3, Harvey)**
- A vertical timeline with dates on the left. Today's slot has a composer where you type or tap to record (browser speech recognition).
- **Generate storyboard** makes a one-page magazine spread: a headline, a drop-cap summary, a mood ribbon, a lead panel, and panels framed green, amber or red by goal fit (the frames can be hidden). It also shows the cast, places and conversations.
- **Analyze a period** (top right): pick a start and end day, the cards fly into an analysis box, and you get a goal-fit bar, insights, and action items with **Send to Scene Scout / Third Place**.

**Nomi Bots (teammate)**
- Bots home is a grid. **Scene Scout** and **Third Place** are live; Opportunity Radar, Spotlight, Circle Host, Get-In Coach and Space Check are "coming soon" tiles.
- The chat looks like iMessage: 1 to 3 short friend-style bubbles, info cards with "View more", a status line under the avatar, expandable milestone bars, and Approve buttons.
- **Bot loop:** a hand-off from Daily comes in, Parallel searches (in the main process), the model picks two or three and writes the bubbles and cards, the user approves, and the main process writes an `.ics` invite and opens it in Apple Calendar.

## 4. The two live bots

**Scene Scout (events and people).** Goal: "rooms with builders like Priya".
1. Parallel Search on event sites, then Task to enrich the top 3 into cards.
2. Tap one, then Approve, then **Add to Apple Calendar**. The card links to the event page so you can request the invite.
3. Follow-on: Parallel Search on two speakers, then suggest a coffee slot as another `.ics` hold.
Milestones: Find → Vet → Calendar hold → Request invite → Intro.

Real fallback cards from a live Parallel search on Oct 19, to use if the wifi drops:
- *Step 5 Preview Launch Night & AI Founders Meetup*, Thu Oct 22, 6pm. Cline founder Saoud Rizwan is speaking, which is great for the Cline judge.
- *Hackers and Founders SF*, Wed Oct 21, 6pm (Meetup).

**Third Place (spaces and communities).** Goal: "climb twice a week and work around builders". It finds a climbing gym with a social night and a co-working spot, each with its vibe and the easiest way in, then adds recurring Tue/Thu `.ics` holds.

## 5. Status and next steps

| Piece | State |
|---|---|
| Scaffold, toggle, hand-off contract, `.ics` | Merged (#1), being ported |
| Electron shell over Next | Merged (#4), now being replaced |
| **Pure Electron + React port** | **In progress** ("Nomi desktop app" thread) |
| Sprout pet | PR #2, ported into the new app |
| Nomi Daily with real model calls and fallback | PR #3, ported into the new app |
| Bots agent loop (Parallel + model) | **Next, teammate:** build it as a main-process handler in the new app, replacing the canned reply |
| Composio host email | Stretch after 2:40 |

## 6. Timeline (11:45 to 3:15)

| Time | Work |
|---|---|
| By 12:15 | Keys in `.env.local` (`CLINE_API_KEY` and/or `OPENAI_API_KEY`, `PARALLEL_API_KEY`). The Electron app runs for both of you. |
| 12:15–1:15 | Land the Electron port with Sprout and Daily in it. Bots: Scene Scout on real Parallel search. |
| 1:15–2:00 | Bots: model picks and writes the bubbles, Approve → `.ics`. Daily: polish the storyboard and Sprout moods. |
| 2:00–2:40 | Third Place. Full path: Sprout → storyboard → hand-off → Calendar. |
| 2:40–3:00 | Record a backup video and save the fallback search results. Composio stretch only if everything is green. |
| 3:00–3:15 | README (with "built with Cline"), push, submit. |

## 7. Demo script (about 3 minutes)

1. **Hook (15s):** "Everyone's building agents for your inbox. But who you become depends on who you're around. Nomi is an open-source desktop companion that rebuilds your offline environment around your goals."
2. **Sprout (30s):** Sprout is sitting on the desktop. It pops up with "hey, how'd today go?", and you tap record: "Worked from my apartment all morning, felt stuck. Lunch alone. AI meetup at 6, met Priya who's building voice agents, felt energized."
3. **Storyboard (30s):** Generate. The magazine spread shows the morning panel framed red and the meetup framed green, and Sprout cheers up. "Your best moments this week all happened in rooms with builders."
4. **Hand-off (10s):** On the green panel, tap Send to Scene Scout.
5. **Scene Scout live (60s):** "ok I'm on it 👀". The status line reads "searching Luma, Meetup…" and real event cards appear. Say: **"That's Parallel, on the live web."** Tap the Step 5 launch night, then Approve, then Add to Apple Calendar, and show it land in Calendar.
6. **Close (20s):** "The brain runs on Cline's API, and you can swap in an open model like Kimi K3 with one env var. Cline built the whole thing, and it's all on GitHub."

Tips: name each sponsor at the moment its product does something visible, and end on the event sitting in Apple Calendar.

## Sources
- Parallel Search API (v1): https://docs.parallel.ai/api-reference/search/search.md
- Parallel product glossary: https://docs.parallel.ai/getting-started/glossary.md
- Cline CLI 2.0: https://cline.bot/blog/introducing-cline-cli-2-0
- Composio quickstart (stretch): https://docs.composio.dev/docs/quickstart
- Composio LinkedIn toolkit limits: https://docs.composio.dev/kb/guide/toolkits-linkedin
