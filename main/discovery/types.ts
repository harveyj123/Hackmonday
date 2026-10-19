// Discovery types. They live here until the team agrees to move Opportunity into the shared contracts.
import type { GoalArea } from "../../lib/types.ts";

export type OpportunityKind = "event" | "group" | "place" | "person";
export type OpportunitySource = "luma" | "meetup" | "eventbrite" | "partiful" | "linkedin" | "web";
export type JoinMode = "rsvp" | "request" | "ticket" | "join_group" | "dropin" | "contact" | "connect";

export type Opportunity = {
  id: string; // sha1 of canonical url
  kind: OpportunityKind;
  source: OpportunitySource;
  area: GoalArea;
  title: string;
  url: string; // canonical
  start?: string; // ISO with offset; events only
  end?: string;
  location?: string;
  host?: { name: string; url?: string; contactUrl?: string };
  whoGoes?: string;
  vibe?: string;
  joinMode: JoinMode;
  whyMatch: string; // one sentence tied to the user's goal
  citations: string[]; // >= 1
  vetted: boolean; // true once a Parallel Task confirmed the fields
};

export type DiscoverRequest = {
  area: GoalArea;
  goal: string;
  context?: string;
  city: string;
  windowDays: number;
  kinds?: OpportunityKind[];
  limit?: number; // default 5
};

export type DiscoverResult = {
  requestId: string;
  opportunities: Opportunity[];
  mode: "live" | "cache" | "mock";
  tookMs: number;
  warnings: string[];
};

export type DiscoverEvent =
  | { requestId: string; type: "progress"; step: "search" | "extract" | "rank" | "vet"; label: string; done: boolean }
  | { requestId: string; type: "vetted"; opportunity: Opportunity }; // replaces the card with the same id
