import { CLAUDE_MODEL } from "./config";

// Thin wrapper around the Anthropic Messages API. Mirrors how the existing
// /api/extract route calls Claude (direct fetch, x-api-key). Key is read from
// env at call time and never stored.

interface CallOpts {
  system: string;
  messages: any[];
  tools?: any[];
  maxTokens?: number;
}

export async function callClaude(opts: CallOpts): Promise<{ content: any[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: opts.messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
    }),
    signal: AbortSignal.timeout(120000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Claude API error: ${data?.error?.message || res.status}`);
  }
  return data;
}

// Concatenate all text blocks from a Claude response.
export function textFromResponse(data: { content: any[] }): string {
  return (data.content || [])
    .map((b: any) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

// Pull the first JSON value (object or array) out of a model response that may
// include prose or ```json fences.
export function parseJsonLoose<T = any>(text: string): T | null {
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
