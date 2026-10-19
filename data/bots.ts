import type { Bot } from "@/lib/types";

export const BOTS: Bot[] = [
  { id: "scene-scout", name: "Scene Scout", emoji: "🔭", tagline: "Events and people you'd click with", live: true },
  { id: "third-place", name: "Third Place", emoji: "🧗", tagline: "Spaces and communities that fit you", live: true },
  { id: "opportunity-radar", name: "Opportunity Radar", emoji: "📡", tagline: "Every opportunity in town for your goals", live: false },
  { id: "spotlight", name: "Spotlight", emoji: "✨", tagline: "Promote yourself to the right people", live: false },
  { id: "circle-host", name: "Circle Host", emoji: "🫶", tagline: "Small meetups for your circle", live: false },
  { id: "get-in-coach", name: "Get-In Coach", emoji: "🎟️", tagline: "Get qualified for the groups you want", live: false },
  { id: "space-check", name: "Space Check", emoji: "🪴", tagline: "Tips for your desk, home and streets", live: false },
];
