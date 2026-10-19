// Parallel web APIs. Owned by Bots. Docs: https://docs.parallel.ai
// Search is sync and fast; FindAll and Task are async (poll or webhook).

export function parallelConfigured() {
  return Boolean(process.env.PARALLEL_API_KEY);
}

export async function search(objective: string, queries: string[] = []) {
  if (!parallelConfigured()) return null;
  // Check the request shape against the current API reference before relying on it.
  const res = await fetch("https://api.parallel.ai/v1beta/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.PARALLEL_API_KEY! },
    body: JSON.stringify({ objective, search_queries: queries, max_results: 5 }),
  });
  if (!res.ok) throw new Error(`Parallel search ${res.status}: ${await res.text()}`);
  return res.json();
}

// TODO(bots): findAll(criteria) for "events matching my goal", task(input, schema) to enrich one hit.
