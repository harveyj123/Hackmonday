// Three seeded past days for the demo persona, so the timeline and period analysis have history.
import type { StoryDay } from "./types";

export const SEED_DAYS: StoryDay[] = [
  {
    date: "2026-10-16",
    headline: "The Climbing Wall Was the Best Meeting of the Week",
    rawText:
      "Morning standup on Zoom from my couch. Spent the afternoon debugging alone. Went to Mission Cliffs at 7 with Leo from my building, he works on robotics. Great session.",
    segments: [
      { id: "s1", time: "09:30", place: "Apartment couch", people: [], activity: "Standup on Zoom", mood: "meh", emoji: "💻", goalFit: 0, why: "Work got done, but nobody new in the room." },
      { id: "s2", time: "14:00", place: "Apartment", people: [], activity: "Debugging solo for four hours", mood: "low", emoji: "🐛", goalFit: -1, why: "Long isolated stretch, no builders around." },
      { id: "s3", time: "19:00", place: "Mission Cliffs", people: ["Leo"], activity: "Bouldering session", conversation: "Leo is prototyping a warehouse robot and wants a software person.", mood: "great", emoji: "🧗", goalFit: 1, why: "Hits the climbing goal and found a builder." },
    ],
    summary: "Your climbing night did double duty: a workout and a founder-ish conversation with Leo. The afternoon alone was the drag.",
    actionItems: [
      { id: "a1", botId: "social-hobbies", title: "Find a climbing gym with a social night", context: "Climbing with Leo was the highlight; wants climbing plus builder company.", fromSegmentId: "s3" },
    ],
  },
  {
    date: "2026-10-17",
    headline: "A Quiet Friday That Never Left the Apartment",
    rawText: "Worked from home all day. Skipped the gym. Ordered takeout and watched YouTube until 1am.",
    segments: [
      { id: "s1", time: "10:00", place: "Apartment", people: [], activity: "Heads-down work", mood: "meh", emoji: "🏠", goalFit: 0, why: "Productive enough, but invisible to the scene." },
      { id: "s2", time: "18:00", place: "Apartment", people: [], activity: "Skipped climbing", mood: "low", emoji: "🛋️", goalFit: -1, why: "Missed one of the two climbing days this week." },
      { id: "s3", time: "22:00", place: "Apartment", people: [], activity: "YouTube until 1am", mood: "low", emoji: "📺", goalFit: -1, why: "Late night cost tomorrow's energy." },
    ],
    summary: "No one new, no climbing, and a late night. Fridays at home seem to slide; a plan with people in it would have rescued this one.",
    actionItems: [
      { id: "a1", botId: "career-growth", title: "Line up a Friday evening event", context: "Friday at home slid into a late night with no people.", fromSegmentId: "s2" },
    ],
  },
  {
    date: "2026-10-18",
    headline: "Coffee With Maya Opened a Door",
    rawText:
      "Coffee at Sightglass with Maya, a YC founder a friend introduced me to. Afternoon hack session at the library. Dinner with my roommate.",
    segments: [
      { id: "s1", time: "10:00", place: "Sightglass Coffee", people: ["Maya"], activity: "Intro coffee", conversation: "Maya invited me to her founder dinner next month.", mood: "great", emoji: "☕", goalFit: 1, why: "A warm intro straight into the founder scene." },
      { id: "s2", time: "13:00", place: "SF Public Library", people: [], activity: "Hack session", mood: "good", emoji: "📚", goalFit: 0, why: "Focused, and out of the apartment." },
      { id: "s3", time: "19:30", place: "Home", people: ["Sam"], activity: "Dinner with roommate", mood: "good", emoji: "🍝", goalFit: 0, why: "Nice and relaxed, neutral for the goals." },
    ],
    summary: "One coffee did more for your founder goal than a week of solo work. Getting out of the apartment helped your focus too.",
    actionItems: [
      { id: "a1", botId: "career-growth", title: "Find events Maya's founder circle goes to", context: "Met Maya (YC founder) at Sightglass, invited to a founder dinner.", fromSegmentId: "s1" },
    ],
  },
];
