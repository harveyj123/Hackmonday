# Nomi: hackathon plan (Cline x Composio x Parallel)

**One-liner for judges:** Nomi is an open-source personal agent that reads your day, sees which people, places and communities push you toward your goals, then goes out on the live web and into your inbox to rebuild that environment for you.

## 1. Can you use the sponsors? Yes, all four fit naturally

| Sponsor | Role in Nomi | What it actually does in the demo |
|---|---|---|
| **Parallel** | Nomi's eyes on the world | **Search API** (`fast` mode, about 700ms) for live lookups inside chat. **FindAll API** to find entities that match a goal ("AI meetups in SF this week where founders show up", "climbing gyms near Mission with social nights"). **Task API** (`core` or `base`) to enrich one hit into structured JSON: host, date, link, who attends, vibe, how to get in. **Monitor API** (stretch) to watch Luma/Meetup for new matches and ping Nomi. |
| **Composio** | Nomi's hands | One `composio.sessions.create(user_id)` session, then `session.tools()` gives the agent meta tools to find, connect and run app actions. Use **Gmail** (email the host, draft a coffee invite), **Google Calendar** (hold the slot, invite the person), **Slack** (stretch: post into a community workspace). **LinkedIn** only for posting (the "promote yourself" bot), since the toolkit supports `LINKEDIN_CREATE_LINKED_IN_POST` but not DMs. |
| **Open-source model** | Nomi's brain and voice | Use the event's open-model credits (an OpenAI-compatible endpoint with something like Kimi K2.x, Qwen or gpt-oss). It drives the agent loop and tool calls, the friend persona (1 to 3 short bubbles), parsing your day into structured events, and scoring each segment against your goals. |
| **Cline** | How you build it, and part of the pitch | Build the whole app with Cline (Plan then Act). Mention it in the demo, and keep `.clinerules` plus a short "built with Cline" section in the README. Cline CLI 2.0 has a headless `-y --json` mode; a cute stretch is a "Nomi builder" that uses Cline headless to spin up a new bot from a goal, but don't depend on it. |

Rule of thumb for the pitch: **Parallel finds it, the open model decides, Composio does it.** Each judge should see their product do something that would be impossible without it.

**Honest constraints to design around**
- No public API lets you register for someone else's Luma, Partiful or Meetup event, or DM on LinkedIn. So "sign you up" in the demo means: Parallel finds the event and the host's contact, then Composio Gmail emails the host and Calendar holds the slot. Say "Nomi requests the invite" rather than "Nomi registers". Check the Composio catalog at kickoff for a Luma toolkit; if it's there, it's a bonus.
- Keep every outbound action behind a one-tap **Approve** in the chat. It's safer, it demos well, and the judges will like seeing control stay with the user.
- Send the demo emails to your own second inbox or a teammate, so it's real but harmless.

## 2. Scope for 3.5 hours

Build **one user, one goal, one day, two bots.** Everything else is a mocked screen or a slide.

**Demo persona:** "Harvey, new in SF, goal: *become part of the AI founder scene and climb twice a week*." Pre-seed three past days so the timeline isn't empty.

**Must have (the demo dies without these)**
1. **Nomi Daily**: a left timeline with 3 seeded days and today. Type (or paste a voice transcript of) your day, hit **Generate**, and get a magazine storyboard: 4 to 6 panels (place, people, activity, mood), each with a green, amber or red frame for goal fit, a hide-frames toggle, and a 3-line summary. Under each red or green panel there's a "Hand to a Nomi bot" chip.
2. **Nomi bots chat**: an iMessage-style thread, friend tone, 1 to 3 bubbles, small info cards with a "View more" link, a status line under the avatar ("finding events..."), and expandable milestone bars per task.
3. **Two real bots, end to end** (see section 3).

**Nice to have, only if time is left:** period analysis (select a range, cards fly into the analysis box, then action items) as an animated but mostly static screen; the Monitor API "new match" ping; a LinkedIn post draft from the Spotlight bot.

**Cut for the hackathon:** photo analysis of streets and desk, the qualification bot, the exclusive circle bot, voice recording (use typed input or a pasted transcript), auth and multi-user, and image generation for the storyboard (render panels with HTML/CSS, emoji or icon and text; it's faster and reads as "magazine" with good typography).

**Stack (boring on purpose):** Next.js and Tailwind; one `/api/agent` route running a tool-calling loop on the open model, with tools = Parallel (search, findall, task) plus Composio session tools; SQLite or JSON file for days and tasks; stream task progress to the UI by server-sent events or polling.

## 3. Which bots to make specific

Make these two real; show the rest as tiles on the bots home page marked "coming soon".

**Bot A: Scene Scout (events plus people, the hero)**
Merges your bullets 1 and 2. Goal in, then:
1. Parallel FindAll: "AI founder events in SF in the next 7 days on Luma, Meetup or Partiful" (seed with a fast Search call if FindAll is slow).
2. Parallel Task on the top 3: host name, contact, date, who usually attends, vibe, link. Rendered as cards.
3. User taps one, and Nomi drafts an email to the host via Composio Gmail ("Hey, I'm new to SF and building X, would love to join") and puts a Calendar hold on the slot. Approve, and it's sent.
4. Follow-on: "Two speakers there are people you'd click with," using Parallel Search for their public profiles, then Nomi drafts a coffee invite to one of them by Gmail and proposes Calendar times.
Milestone bar: Find → Vet → Contact host → Calendar hold → Intro.

**Bot B: Third Place (spaces and communities)**
Merges bullets 3 and 4. "You want to climb twice a week and meet builders": Parallel Search and Task find a climbing gym with a social night plus a co-working space where AI founders hang out, each with a vibe summary and "easiest way in" (a drop-in day pass, a newbie night). Action: Calendar recurring block for Tue/Thu plus an email asking the space about a trial day.

**Tiles only:** Opportunity Radar (Monitor API, bullet 5), Spotlight (LinkedIn self-promotion post, bullet 8), Circle Host (exclusive group meetups, bullet 6), Get-In Coach (qualification, bullet 7), Space Check (photo analysis, bullet 9).

## 4. How Daily connects to Bots (the story the judges remember)

Daily isn't a journal; it's the **sensor**. The open model turns your day into JSON segments `{time, place, people[], activity, mood, goal_fit: +1|0|-1, why}`. A red segment ("3 hours scrolling at home, no one met") becomes a suggested action ("Find a place to work around builders"), and one tap hands it to Third Place. A green one ("great chat with Priya at the AI meetup") hands off to Scene Scout ("find more rooms Priya would be in"). That loop, **reflect, then act**, is the differentiator from every inbox-summary agent in the room.

## 4b. The Nomi pet (your idea, folded in)

Nomi Daily gets a face: a small, cute pet that lives in the corner of your screen and *is* the check-in. In the evening it hops up and asks "how was today?", you type or talk to it, and it carries your day off to make the storyboard. Its mood reflects your goal fit: it glows and bounces after green days, droops after red ones, and wears a tiny badge when a bot finishes a task ("I got you into Thursday's meetup!"). This makes Nomi feel like a friend instead of a dashboard, and it gives the demo a memorable opening.

**Scope it like this for today:**
- **Build:** the pet as a floating sprite inside the web app, bottom-right on every page (an SVG or CSS character with 3 states: happy, neutral, sad, plus a "busy" animation while bots work). Click it to open a speech-bubble input, which is the Daily input. About 30 to 40 minutes, done in the 1:15 to 2:00 slot alongside Daily.
- **Stretch only:** a real always-on-top desktop pet (a transparent Tauri or Electron window). It's the dream version, but window and packaging fiddling can eat an hour, so pitch it as "next" with a mock in the README.
- **Demo:** open on the pet. It pops up, "hey, how'd today go?", and you answer it. That becomes step 2 of the script below.

## 5. Build timeline (11:45 to 3:15)

| Time | Work |
|---|---|
| 11:45–12:15 | Cline scaffolds Next.js, page shell with the Daily/Bots toggle, seed data. Get keys working: Parallel, Composio (connect Gmail and Calendar with your own account), open model. |
| 12:15–1:15 | Agent route plus tools. Scene Scout working in a bare UI: FindAll or Search, then Task, then Gmail draft. |
| 1:15–2:00 | Daily: the input, the parse-to-JSON prompt, the storyboard render with colored frames, summary, hand-off chips. |
| 2:00–2:40 | Chat polish: bubbles, cards, status line, milestone bars, approve buttons. Third Place bot (reuses the same tools). |
| 2:40–3:00 | Record a backup video of the full happy path. Cache one good Parallel result in case wifi dies. |
| 3:00–3:15 | README (architecture diagram, sponsor usage, "built with Cline"), push the public repo, submit. |

## 6. Demo script (about 3 minutes)

1. **Hook (15s):** "Everyone's building agents that manage your inbox. But who you become depends on who you're around. Nomi is an open-source agent that rebuilds your offline environment around your goals."
2. **Daily (45s):** The Nomi pet pops up in the corner: "hey, how'd today go?" Answer it: "Worked from my apartment all morning, felt stuck. Lunch alone. Went to an AI meetup at 6, met Priya who's building voice agents, felt energized." Hit Generate. The storyboard appears: the morning panel framed red, the meetup framed green. Read the one-line insight: "Your best moments this week all happened in rooms with builders. Your mornings at home are draining you."
3. **Hand-off (10s):** Tap "Hand to Nomi" on the green panel. It switches to Bots and opens Scene Scout.
4. **Scene Scout live (60s):** Nomi texts: "ok I'm on it 👀", then "found 3 rooms Priya-type people will be in this week". The status line reads "searching Luma, Meetup...". Show cards. Say out loud: **"That's Parallel FindAll and Task on the live web, with citations."** Tap one, and Nomi drafts the host email and a Calendar hold. Tap Approve, then flip to the real Gmail sent folder. **"That's Composio. I connected Gmail once and the agent got hundreds of actions."**
5. **Third Place (30s):** Expand the milestones on a second task already running: a gym with Thursday social climbs, Calendar block added.
6. **Close (20s):** "The brain is an open model, the whole thing was built with Cline, and it's all on GitHub. Nomi: your environment, on purpose."

Tips: keep the network-heavy steps live but have the cached result one keypress away. Name each sponsor at the exact moment their product does something visible. End on the Gmail sent folder or the Calendar, because real side effects beat screenshots.

## Sources checked
- Parallel product glossary: https://docs.parallel.ai/getting-started/glossary.md
- Composio docs and quickstart (sessions, `session.tools()`, Connect Links): https://docs.composio.dev/docs/quickstart
- Composio LinkedIn toolkit limits: https://docs.composio.dev/kb/guide/toolkits-linkedin
- Cline CLI 2.0 (headless `-y`, `--json`): https://cline.bot/blog/introducing-cline-cli-2-0
