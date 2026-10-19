// Thin client for OpenAI-compatible endpoints, with two named sides so one running dry doesn't stop the demo:
//   cline  -> CLINE_API_KEY (+ CLINE_MODEL), served by api.cline.bot on Cline credits
//   openai -> OPENAI_API_KEY (+ OPENAI_MODEL, OPENAI_BASE_URL for any other compatible host)
//   custom -> LLM_BASE_URL + LLM_API_KEY + LLM_MODEL (the original setup, still works)
// The preferred side is tried first and the others are the fallback. Returns null when nothing is
// configured so callers can fall back to mocks.

type Msg = { role: "system" | "user" | "assistant"; content: string };

export type ProviderName = "cline" | "openai" | "custom";
type Provider = { name: ProviderName; baseUrl: string; apiKey: string; model: string };

function configured(): Provider[] {
  const env = process.env;
  const all: (Provider | null)[] = [
    env.CLINE_API_KEY
      ? { name: "cline", baseUrl: "https://api.cline.bot/api/v1", apiKey: env.CLINE_API_KEY, model: env.CLINE_MODEL || "anthropic/claude-sonnet-5.5" }
      : null,
    env.OPENAI_API_KEY
      ? { name: "openai", baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || "gpt-4o-mini" }
      : null,
    env.LLM_BASE_URL && env.LLM_API_KEY && env.LLM_MODEL
      ? { name: "custom", baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY, model: env.LLM_MODEL }
      : null,
  ];
  return all.filter((p): p is Provider => p !== null);
}

// Preferred side first: the call's own choice, else LLM_PROVIDER, else the order above.
function ordered(prefer?: string): Provider[] {
  const list = configured();
  const first = prefer || process.env.LLM_PROVIDER;
  return first ? [...list.filter((p) => p.name === first), ...list.filter((p) => p.name !== first)] : list;
}

export function llmConfigured() {
  return configured().length > 0;
}

async function call(p: Provider, messages: Msg[], json: boolean): Promise<string | null> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, messages, ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const data = body.data ?? body; // the Cline API wraps the OpenAI body in { data }
  return data.choices?.[0]?.message?.content ?? null;
}

export async function chat(messages: Msg[], opts: { json?: boolean; provider?: string } = {}): Promise<string | null> {
  const list = ordered(opts.provider);
  if (!list.length) return null;
  let lastError: unknown;
  for (const p of list) {
    try {
      const out = await call(p, messages, Boolean(opts.json));
      if (out) {
        console.log(`[llm] served by ${p.name} (${p.model})`);
        return out;
      }
    } catch (e) {
      lastError = e;
      console.warn(`[llm] ${p.name} failed, trying the next side:`, e instanceof Error ? e.message : e);
    }
  }
  throw lastError ?? new Error("every LLM side returned nothing");
}
