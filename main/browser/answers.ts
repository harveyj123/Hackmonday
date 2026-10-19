// Answers to a form's custom questions. B4 ships canned answers taken straight from the profile;
// B5 adds model-written ones with these as the fallback. Every answer is shown on the review card.
import type { Profile } from "./profile.ts";

export type AnswerFn = (questions: string[]) => Promise<string[]>;

// Keep it true to the profile and at most 2 sentences.
function canned(question: string, p: Profile): string {
  const q = question.toLowerCase();
  if (/linkedin/.test(q)) return p.linkedinUrl ?? p.oneLiner ?? p.name;
  if (/build|working on|project|startup/.test(q)) return p.building ?? p.oneLiner ?? "Building an AI product.";
  if (/why|attend|interest|hope to|looking for/.test(q)) {
    const topics = p.interests?.slice(0, 2).join(" and ") || "AI";
    return `I want to meet people working on ${topics}${p.city ? ` in ${p.city}` : ""}.`;
  }
  if (/hear about|find out|found/.test(q)) return "I found it through Nomi while looking for builder events nearby.";
  return p.oneLiner ?? p.building ?? `I'm ${p.name}.`;
}

export function cannedAnswers(questions: string[], p: Profile): string[] {
  return questions.map((q) => canned(q, p));
}
