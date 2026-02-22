import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { system, messages, tools } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system,
        messages,
        tools,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Claude API error:", JSON.stringify(data));
      return NextResponse.json({ error: data.error?.message || "Claude API error", details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Extract route error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
