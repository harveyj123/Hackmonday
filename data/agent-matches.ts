import type { BotId, PendingAction } from "@/lib/types";

export type MatchIntent = "event" | "person" | "space" | "community" | "opportunity";

export type AgentMatch = {
  title: string;
  subtitle: string;
  message: string;
  taskTitle: string;
  url?: string;
  imageUrl?: string;
  host?: string;
  why?: string;
  people?: string[];
  action?: {
    kind: PendingAction["kind"];
    summary: string;
    contactName?: string;
    subject?: string;
    draft: string;
    profileUrl?: string;
  };
};

const SHARED_CAREER_EVENT: AgentMatch = {
  title: "Applied AI Founders Salon",
  subtitle: "Thu 7:00 PM · SoMa · 28 founders · Invite list available",
  message: "This is the strongest match I found. It’s a small room of founders building personal agents and applied AI—not another broad networking mixer.",
  taskTitle: "Get into the right founder room",
  host: "Maya Chen · Product Guild",
  why: "A concentrated room of founders working on adjacent products, with enough structure for real conversations.",
  people: ["Maya Chen", "Owen Li", "Rhea Patel", "+24"],
  imageUrl: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=640&q=82",
  action: {
    kind: "request_signup",
    summary: "Ask Maya for a place and the guest list",
    contactName: "Maya Chen",
    subject: "Applied AI Founders Salon",
    draft: "Hi Maya — I’m building a personal agent product and the Applied AI Founders Salon looks unusually relevant to what I’m working through right now. I’d love to join this Thursday. Is there room for one more, and could you share the guest list so I can prepare for the right conversations?",
  },
};

export const AGENT_MATCHES: Record<BotId, Record<MatchIntent, AgentMatch[]>> = {
  "career-growth": {
    event: [SHARED_CAREER_EVENT],
    person: [
      {
        title: "Jordan Lee",
        subtitle: "Building voice interfaces · 2 shared communities",
        message: "Jordan looks like someone you’d genuinely have things to talk about with. There’s enough overlap for a natural intro without forcing the networking angle.",
        taskTitle: "Turn a relevant connection into a real conversation",
        action: {
          kind: "send_dm",
          summary: "Prepare a casual intro to Jordan",
          contactName: "Jordan Lee",
          profileUrl: "https://www.linkedin.com/search/results/people/?keywords=Jordan%20Lee%20voice%20AI",
          draft: "Hey Jordan — I came across your work on voice interfaces. I’m building around AI products too and would be down to grab coffee and trade notes sometime, if you’re up for it.",
        },
      },
    ],
    space: [
      {
        title: "Frontier House",
        subtitle: "Mission · Founder lunches · $35 trial day",
        message: "This feels like a better fit than another silent coworking floor. People actually talk here, and the trial day lets you test the atmosphere without committing.",
        taskTitle: "Try a workspace that changes your environment",
        imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=640&q=82",
        action: {
          kind: "send_email",
          summary: "Draft a trial-day request",
          contactName: "Frontier House community team",
          subject: "Trial day at Frontier House",
          draft: "Hi — I’d love to try Frontier House for a day next week. I’m looking for a focused place to work around other early-stage builders, but I’m not considering a full membership yet. Is there a good day to visit?",
        },
      },
    ],
    community: [
      {
        title: "AI Founder Roundtable",
        subtitle: "Every Wednesday · 10 founders · Fundraising and product strategy",
        message: "This is a much better fit for a fundraising period than a large founder event. The group is small enough to get specific feedback and warm investor paths.",
        taskTitle: "Enter the right room for this company phase",
        host: "Evan Brooks · a16z network",
        why: "The current discussion cycle is fundraising narratives, demo feedback, and investor introductions.",
        people: ["Evan Brooks", "Tara Singh", "Noah Kim", "+7"],
        action: {
          kind: "request_signup",
          summary: "Send the host last week’s demo video",
          contactName: "Evan Brooks",
          subject: "Wednesday AI Founder Roundtable",
          draft: "Hi Evan — we’re entering fundraising for our personal agent product, and your Wednesday roundtable sounds directly relevant. I’d love to share the short demo video we made last week so you can see whether the group is a fit. Would you be open to taking a look and considering me for the next session?",
        },
      },
    ],
    opportunity: [
      {
        title: "AI Builders Demo Night",
        subtitle: "Tuesday · Live product demos · Best for collaborators",
        message: "This one is worth your time if you want feedback and potential collaborators, not just another panel.",
        taskTitle: "Act on a high-fit local opportunity",
        action: {
          kind: "request_signup",
          summary: "Prepare a Demo Night signup request",
          contactName: "Demo Night organizer",
          subject: "AI Builders Demo Night",
          draft: "Hi — I’m building an AI product and would love to attend Demo Night this Tuesday. I’m especially interested in meeting other early-stage builders and sharing what I’m working on. Is there space available?",
        },
      },
      {
        title: "Founder Work Session",
        subtitle: "Friday · Coworking plus dinner · Best for recurring community",
        message: "This is the quieter option, but probably the stronger long-term fit. It gives you a reason to see the same people again.",
        taskTitle: "Build a repeatable founder routine",
      },
    ],
  },
  "health-sports": {
    event: [
      {
        title: "Thursday Social Climb",
        subtitle: "6:30 PM · Dogpatch · Beginner-friendly",
        message: "This one feels right: social without being forced, and friendly to people arriving alone. Going to orientation first makes joining the group much easier.",
        taskTitle: "Join a social activity you’ll want to repeat",
        host: "Kai Morgan · Dogpatch Climbers",
        why: "A repeatable activity with a built-in beginner introduction, so both the sport and the people can become part of your week.",
        people: ["Kai Morgan", "Mia Patel", "Leo Chen", "+14"],
        imageUrl: "https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=640&q=82",
        action: {
          kind: "request_signup",
          summary: "Prepare a note to the climb organizer",
          contactName: "Thursday Social Climb organizer",
          subject: "Joining Thursday Social Climb",
          draft: "Hi — I’m hoping to join Thursday’s social climb and I’ll be coming on my own. Is the 6:30 orientation the best place to start, and do I need to register ahead of time?",
        },
      },
    ],
    person: [
      {
        title: "Mia Patel",
        subtitle: "Weekend run-club captain · Welcomes new runners",
        message: "Mia seems like the right person to ask because she actively helps new people join the group. A short, specific message will feel natural here.",
        taskTitle: "Find a friendly way into a sports group",
        action: {
          kind: "send_dm",
          summary: "Prepare a message to Mia",
          contactName: "Mia Patel",
          profileUrl: "https://www.linkedin.com/search/results/people/?keywords=Mia%20Patel%20run%20club%20San%20Francisco",
          draft: "Hey Mia — I’m looking for a friendly run group I can join consistently, and your weekend group came up. I’m still building my pace; would this Saturday be a good first session?",
        },
      },
    ],
    space: [
      {
        title: "Dogpatch Boulders",
        subtitle: "Open training floor · Social Thursdays · Easy drop-in",
        message: "The space naturally nudges you toward the routine you want. It’s active, social, and the Thursday crowd seems much more welcoming than intense.",
        taskTitle: "Test a space that supports a healthy routine",
        action: {
          kind: "send_email",
          summary: "Draft a first-visit question",
          contactName: "Dogpatch Boulders team",
          subject: "First visit and social climb",
          draft: "Hi — I’m planning my first visit and would like to join a social climb rather than climb alone. Is Thursday still the best evening for newcomers, and is there anything I should book first?",
        },
      },
    ],
    community: [
      {
        title: "Morning Miles",
        subtitle: "Relaxed Saturday runs · Coffee afterward · All paces",
        message: "The vibe is friendly and routine-first, not competitive. The easiest entry is the short route plus coffee afterward, where people actually hang out.",
        taskTitle: "Join a healthy community without the awkward entry",
        host: "Mia Patel · Morning Miles",
        why: "All paces are welcome, and the coffee afterward turns a workout into a recurring social anchor.",
        people: ["Mia Patel", "Jon Bell", "Ari Gomez", "+18"],
        imageUrl: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=640&q=82",
        action: {
          kind: "send_dm",
          summary: "Prepare a note to the run captain",
          contactName: "Morning Miles captain",
          profileUrl: "https://www.instagram.com/explore/search/keyword/?q=morning%20run%20club%20san%20francisco",
          draft: "Hey — I’m thinking of joining Morning Miles this Saturday for the first time. Is the shorter route a good starting point, and where does everyone meet?",
        },
      },
    ],
    opportunity: [
      {
        title: "Bay Area Trail Challenge",
        subtitle: "Four-week challenge · Flexible routes · Community finish day",
        message: "This lines up nicely with your goal because it gives you structure without locking every session to one time.",
        taskTitle: "Turn a health goal into a motivating local challenge",
        action: {
          kind: "request_signup",
          summary: "Prepare a signup question",
          contactName: "Trail Challenge team",
          subject: "Bay Area Trail Challenge",
          draft: "Hi — I’m interested in joining the four-week trail challenge. Can participants choose beginner-friendly routes, and is it okay to join without an existing team?",
        },
      },
    ],
  },
  "social-hobbies": {
    event: [
      {
        title: "Pottery & Pizza Night",
        subtitle: "Friday 6:30 PM · Mission · 18 people",
        message: "This is small enough to actually talk to people, and the activity removes the pressure to make conversation from nothing.",
        taskTitle: "Get into a low-pressure social activity",
        host: "Rosa Kim · Clay House",
        why: "The shared activity makes conversation natural, and the group is small enough to remember people next time.",
        people: ["Rosa Kim", "Lena Ortiz", "Theo Park", "+14"],
        imageUrl: "https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=640&q=82",
        action: {
          kind: "request_signup",
          summary: "Prepare a signup request",
          contactName: "Pottery Night host",
          subject: "Pottery & Pizza Night",
          draft: "Hi — I’d love to join Pottery & Pizza Night this Friday. I’ll be coming on my own; is there still a spot available, and do I need to bring anything?",
        },
      },
    ],
    person: [
      {
        title: "Lena Ortiz",
        subtitle: "Runs small creative meetups · Photography and design",
        message: "Lena’s groups look genuinely friendly, and you already share enough interests for the message not to feel random.",
        taskTitle: "Turn a shared interest into a new connection",
        action: {
          kind: "send_dm",
          summary: "Prepare a casual message to Lena",
          contactName: "Lena Ortiz",
          profileUrl: "https://www.linkedin.com/search/results/people/?keywords=Lena%20Ortiz%20photography%20San%20Francisco",
          draft: "Hey Lena — I came across the small creative meetups you organize. I’m getting back into photography and would love to join something relaxed where people actually get to know each other. Is there another meetup coming up?",
        },
      },
    ],
    space: [
      {
        title: "The Workshop",
        subtitle: "Shared art tables · Open studio Sundays · Mission",
        message: "This place makes doing the hobby the default—you walk in and people are already making things together. Sunday open studio is the easiest, least awkward entry.",
        taskTitle: "Try a space where your hobby happens naturally",
        action: {
          kind: "send_email",
          summary: "Draft an open-studio question",
          contactName: "The Workshop host",
          subject: "Sunday open studio",
          draft: "Hi — I’d like to try Sunday’s open studio for the first time. I’m looking for a relaxed creative space and will be coming alone. Can I drop in, or should I reserve a place?",
        },
      },
    ],
    community: [
      {
        title: "Sunday Summit Hike",
        subtitle: "Sunday 9:00 AM · Presidio · 16 people · Coffee afterward",
        message: "Since you’re new in town, this is a natural first room: an easy recurring hike where people actually have time to talk. The group happens to include quite a few founders and product people.",
        taskTitle: "Use a recurring activity to build a local circle",
        host: "Nina Park · Weekend Commons",
        why: "Low-pressure, recurring, and easy to attend alone; the walk creates better conversations than a mixer.",
        people: ["Nina Park", "Sam Rivera", "Leah Wong", "+12"],
        imageUrl: "https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=640&q=82",
        action: {
          kind: "send_dm",
          summary: "Ask Nina to add you to Sunday’s hike",
          contactName: "Nina Park",
          profileUrl: "https://www.instagram.com/explore/search/keyword/?q=san%20francisco%20hiking%20group",
          draft: "Hey Nina — I’m new in town and Sunday Summit sounds like exactly the kind of recurring, low-pressure group I’ve been looking for. I’d love to join this Sunday if there’s room. Is it okay to come alone, and where does everyone meet?",
        },
      },
    ],
    opportunity: [
      {
        title: "Neighborhood Arts Festival Crew",
        subtitle: "Weekend volunteer team · Meet local artists and organizers",
        message: "This is a strong social opportunity because you’ll be doing something alongside people instead of just walking into a mixer.",
        taskTitle: "Use a local opportunity to build real connections",
        action: {
          kind: "request_signup",
          summary: "Prepare a volunteer inquiry",
          contactName: "Arts Festival volunteer team",
          subject: "Arts Festival volunteer team",
          draft: "Hi — I’d love to help with the Neighborhood Arts Festival this weekend. I’m especially interested in roles where I can work alongside the artist or community teams. Are you still accepting volunteers?",
        },
      },
    ],
  },
};

export function detectMatchIntent(text: string): MatchIntent | null {
  if (/opportunit|anything.+(?:town|city|week)|what(?:'s| is) happening|aligned with my goals/i.test(text)) return "opportunity";
  if (/space|cowork|place to work|studio|gym|atmosphere|environment|where should i go/i.test(text)) return "space";
  if (/communit|club|vibe|group|easiest way (?:in|to join)|belong/i.test(text)) return "community";
  if (/\bpeople\b|\bperson\b|\bsomeone\b|hang out|shoot.+dm|message them|contact them|meet more people like/i.test(text)) return "person";
  if (/event|activit|host|sign.?up|ticket|happening this week/i.test(text)) return "event";
  return null;
}
