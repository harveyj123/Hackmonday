// Parallel web APIs. Owned by Bots. Docs: https://docs.parallel.ai
// Search is sync and fast; FindAll and Task are async (poll or webhook).

export function parallelConfigured() {
  return Boolean(process.env.PARALLEL_API_KEY);
}

export type SearchResult = { url: string; title: string | null; publish_date: string | null; excerpts: string[] };

// https://docs.parallel.ai/api-reference/search/search.md
export async function search(
  objective: string,
  queries: string[],
  opts: { maxResults?: number; includeDomains?: string[] } = {},
): Promise<SearchResult[] | null> {
  if (!parallelConfigured()) return null;
  const res = await fetch("https://api.parallel.ai/v1/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.PARALLEL_API_KEY! },
    body: JSON.stringify({
      objective,
      search_queries: queries, // 2 to 3 keyword queries of 3 to 6 words work best
      mode: "fast",
      advanced_settings: {
        max_results: opts.maxResults ?? 5,
        ...(opts.includeDomains ? { source_policy: { include_domains: opts.includeDomains } } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Parallel search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results;
}

// Event sites for Scene Scout, e.g. search(objective, queries, { includeDomains: EVENT_DOMAINS }).
export const EVENT_DOMAINS = ["lu.ma", "luma.com", "partiful.com", "meetup.com", "eventbrite.com"];

// TODO(bots): findAll(criteria) for "events matching my goal", task(input, schema) to enrich one hit.
