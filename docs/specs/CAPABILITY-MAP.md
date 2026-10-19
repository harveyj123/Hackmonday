# Capability Map: Nomi data sources and browser use (Joey)

Status: **approved** (module split confirmed 2026-10-19)

| Module id | Responsibility | Depends on |
|---|---|---|
| `discovery` | Finds opportunities on the live web through Parallel (Search, FindAll, Task): events on Luma, Meetup, Eventbrite and Partiful, public people profiles, and venues. Normalizes them into `Opportunity[]`, dedupes, ranks, caches. | — |
| `browser-actions` | Uses the visible, logged-in "Nomi browser" window inside the Electron app to open an opportunity, RSVP, request to join, join a group or fill a contact form. Pauses before the final submit for the user's Approve and streams progress steps. | `discovery` (consumes `Opportunity`) |

Build order: `discovery` → `browser-actions`

Consumer: the bot engine (`app/api/agent`, Bots teammate) calls `discover()`, and the chat UI (`features/bots`) calls `window.nomi.browser.*`. Nothing else in the app depends on these modules.

Specs:
- [SPEC-discovery.md](SPEC-discovery.md)
- [SPEC-browser-actions.md](SPEC-browser-actions.md)
