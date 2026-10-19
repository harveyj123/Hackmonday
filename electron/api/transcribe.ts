// Voice check-in: 16 kHz WAV from the mic in, text out. Tries OpenAI's transcription endpoint when
// OPENAI_API_KEY is set (OPENAI_BASE_URL, TRANSCRIBE_MODEL), then Whisper running on this Mac
// (whisper.cpp's whisper-cli plus a model; `npm run voice:setup` installs both). With neither it says so.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const WHISPER_BINS = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli", "whisper-cli"];
const WHISPER_MODEL = () => process.env.WHISPER_MODEL || join(homedir(), ".nomi", "ggml-base.en.bin");

async function openai(audio: ArrayBuffer, key: string) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "checkin.wav");
  form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  const res = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { text?: string }).text ?? "";
}

function run(bin: string, args: string[]) {
  return new Promise<string>((resolve, reject) =>
    execFile(bin, args, { timeout: 60_000, maxBuffer: 4 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );
}

async function localWhisper(audio: ArrayBuffer): Promise<string | null> {
  const model = WHISPER_MODEL();
  if (!existsSync(model)) return null;
  const file = join(tmpdir(), `nomi-checkin-${Date.now()}.wav`);
  await writeFile(file, Buffer.from(audio));
  try {
    for (const bin of WHISPER_BINS) {
      if (bin.startsWith("/") && !existsSync(bin)) continue;
      try {
        const out = await run(bin, ["-m", model, "-f", file, "-l", "en", "-nt", "-np"]);
        return out.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return null;
  } finally {
    unlink(file).catch(() => {});
  }
}

export async function POST(req: Request) {
  const audio = await req.arrayBuffer();
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      return Response.json({ text: await openai(audio, key) });
    } catch (e) {
      console.warn("[transcribe] OpenAI failed, trying local Whisper:", e instanceof Error ? e.message : e);
    }
  }
  const text = await localWhisper(audio);
  if (text !== null) return Response.json({ text });
  return Response.json({ error: "Voice needs an OpenAI key or Whisper on this Mac (npm run voice:setup). Type it for now." });
}
