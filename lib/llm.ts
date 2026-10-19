// Thin client for any OpenAI-compatible endpoint (the event's open-model credits).
// Returns null when no key is set so callers can fall back to mocks.

type Msg = { role: "system" | "user" | "assistant"; content: string };

export function llmConfigured() {
  return Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL);
}

export async function chat(messages: Msg[], opts: { json?: boolean } = {}): Promise<string | null> {
  if (!llmConfigured()) return null;
  const res = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const data = json.data ?? json; // the Cline API wraps the OpenAI body in { data }
  return data.choices?.[0]?.message?.content ?? null;
}
