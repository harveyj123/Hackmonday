// Shared contracts between Daily and Bots. Change these only after telling the other person.

export type GoalArea = "career" | "health" | "hobbies" | "social";

export type Goal = {
  id: string;
  area: GoalArea;
  text: string;
};

// -1 drags you away from your goals, 0 neutral, +1 pushes you toward them.
export type GoalFit = -1 | 0 | 1;

export type Mood = "great" | "good" | "meh" | "low";

export type DaySegment = {
  id: string;
  time: string; // "09:00" or "morning"
  place: string;
  people: string[];
  activity: string;
  conversation?: string;
  mood: Mood;
  emoji: string;
  goalFit: GoalFit;
  why: string; // one line on why it helps or hurts the goals
};

export type DayEntry = {
  date: string; // YYYY-MM-DD
  rawText: string;
  segments: DaySegment[];
  summary: string;
  actionItems: ActionItem[];
};

export type BotId = "career-growth" | "health-sports" | "social-hobbies";

// The hand-off from Daily to Bots. Daily creates these; Bots consumes them.
export type ActionItem = {
  id: string;
  botId: BotId;
  title: string; // "Find more rooms with builders like Priya"
  context: string; // what the bot should know from the day
  fromSegmentId?: string;
};

export type Bot = {
  id: BotId | string;
  name: string;
  emoji: string;
  tagline: string;
  live: boolean; // false = "coming soon" tile
};

export type InfoCard = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url?: string; // rendered as a link
  cta?: string; // link label, defaults to "View more"
  eyebrow?: string;
  host?: string;
  why?: string;
  people?: string[];
  source?: string; // the site a live result came from (e.g. "Luma"); shows "Found with Parallel"
};

export type ChatMessage = {
  id: string;
  role: "user" | "bot";
  text: string; // keep to 1 to 3 sentences
  card?: InfoCard;
  approval?: PendingAction; // shows an Approve button
};

export type PendingAction = {
  id: string;
  kind: "calendar_hold" | "send_email" | "send_dm" | "request_signup" | "linkedin_post";
  summary: string; // "Hold Thu 7pm for AI Founders Dinner"
  payload: Record<string, unknown>;
};

export type MilestoneStatus = "done" | "active" | "todo";

export type BotTask = {
  id: string;
  botId: BotId;
  title: string;
  milestones: { label: string; status: MilestoneStatus }[];
};

export type MemoryKind = "goal" | "person" | "community" | "place" | "preference" | "constraint" | "commitment";

export type MemoryCandidate = {
  kind: MemoryKind;
  text: string;
};

export type NomiMemory = MemoryCandidate & {
  id: string;
  createdAt: string;
};

// POST /api/daily
// context: lines Nomi read from the Mac for that day ("Calendar 6:00 PM: AI Founders Meetup").
export type DailyRequest = { date: string; text: string; goals: Goal[]; context?: string[] };
export type DailyResponse = DayEntry;

// POST /api/agent
export type AgentRequest = {
  botId: BotId;
  history: ChatMessage[];
  memories?: NomiMemory[];
  message?: string;
  handoff?: ActionItem;
  approve?: string; // PendingAction id the user approved
};
export type AgentResponse = {
  messages: ChatMessage[];
  tasks: BotTask[];
  status: string;
  learnedMemories?: MemoryCandidate[];
};

// Shared memory store, owned by Bots and kept in the main process (electron/api/memory.ts).
// Every bot reads it; Daily writes check-ins and plan outcomes into it.
export type GoalProgress = {
  id: string;
  title: string;
  botId?: BotId;
  progress: number; // 0..1
  note?: string;
  updatedAt: string;
};

export type MemoryEvent = {
  at: string;
  source: "daily" | "bot" | "user";
  kind: "checkin" | "plan" | "plan-done" | "plan-skipped" | "booking" | "request" | "note";
  text: string;
  botId?: BotId;
};

export type SharedMemory = { items: NomiMemory[]; goals: GoalProgress[]; events: MemoryEvent[]; updatedAt: string };

// POST /api/memory merges; it never replaces.
export type MemoryUpdate = {
  items?: MemoryCandidate[];
  events?: Omit<MemoryEvent, "at">[] | MemoryEvent[];
  goals?: (Partial<GoalProgress> & { title: string })[];
  forget?: string; // NomiMemory id
  daily?: NomiMemory[]; // Daily's own entries (ids start with "daily-"); replaces the previous set
};

// POST /api/route: the "what do you need" box picks a bot.
export type RouteRequest = { text: string };
export type RouteResponse = { botId: BotId; reason: string };

// POST /api/suggestions: bots scout proactively from memory; Sprout shows these as nudges.
export type Suggestion = {
  id: string;
  botId: BotId;
  title: string;
  why: string;
  when?: string;
  where?: string;
  url?: string;
  source?: string; // "parallel" | "curated"
  createdAt: string;
};
export type SuggestionsRequest = { limit?: number; botId?: BotId };
export type SuggestionsResponse = { suggestions: Suggestion[] };
