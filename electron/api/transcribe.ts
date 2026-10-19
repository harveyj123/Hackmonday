// Voice check-in: audio from the mic in, text out. Uses OpenAI's transcription endpoint (OPENAI_API_KEY,
// OPENAI_BASE_URL, TRANSCRIBE_MODEL). Without a key it returns a sample entry so the demo still flows.
const SAMPLE =
  "Worked from my apartment all morning and felt stuck. Standup at 10 was fine. Went to the AI Founders Meetup at 6 and met Priya, she's building voice agents. Also I really want to try Sightglass Saturday morning.";

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ text: SAMPLE, demo: true });
  const type = req.headers.get("content-type") || "audio/webm";
  const form = new FormData();
  form.append("file", new Blob([await req.arrayBuffer()], { type }), `checkin.${type.includes("mp4") ? "mp4" : "webm"}`);
  form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = (await res.json()) as { text?: string };
  return Response.json({ text: out.text ?? "" });
}
