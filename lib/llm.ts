// Thin client for OpenAI or another OpenAI-compatible endpoint.
// Returns null when no key is set so callers can fall back gracefully.

type Msg = { role: "system" | "user" | "assistant"; content: string };

function config() {
  const openAIKey = process.env.OPENAI_API_KEY;
  return {
    baseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || (openAIKey ? "https://api.openai.com/v1" : ""),
    apiKey: process.env.LLM_API_KEY || openAIKey || "",
    model: process.env.LLM_MODEL || process.env.OPENAI_MODEL || (openAIKey ? "gpt-5-mini" : ""),
  };
}

export function llmConfigured() {
  const { baseUrl, apiKey, model } = config();
  return Boolean(baseUrl && apiKey && model);
}

export async function chat(messages: Msg[], opts: { json?: boolean } = {}): Promise<string | null> {
  if (!llmConfigured()) return null;
  const { baseUrl, apiKey, model } = config();
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}
