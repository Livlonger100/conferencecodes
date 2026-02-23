import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { system, messages, tools } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Extract URLs from the user message to pre-fetch page content
  const userMsg = messages?.[0]?.content || "";
  const urlRegex = /https?:\/\/[^\s,\n]+/g;
  const urls = userMsg.match(urlRegex) || [];

  // Fetch each URL's HTML content server-side
  let pageContents = "";
  for (const url of urls.slice(0, 5)) { // max 5 URLs
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags but keep text content, limit to 30k chars
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 30000);
        pageContents += `\n\n=== Content from ${url} ===\n${text}\n`;
      }
    } catch (e) {
      pageContents += `\n\n=== Failed to fetch ${url} ===\n`;
    }
  }

  // Also try common subpages
  if (urls.length > 0) {
    const baseUrl = new URL(urls[0]);
    const baseDomain = `${baseUrl.protocol}//${baseUrl.host}${baseUrl.pathname.replace(/\/+$/, "")}`;
    const subpages = ["/pricing", "/tickets", "/register", "/registration", "/attend"];
    
    for (const sub of subpages) {
      const subUrl = baseDomain + sub;
      if (urls.includes(subUrl)) continue; // already fetched
      try {
        const res = await fetch(subUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok && res.status === 200) {
          const html = await res.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 15000);
          if (text.length > 500) { // only include if substantial content
            pageContents += `\n\n=== Content from ${subUrl} ===\n${text}\n`;
          }
        }
      } catch (e) {
        // skip failed subpages silently
      }
    }
  }

  // Modify the user message to include fetched content
  const enhancedMessages = [...messages];
  if (pageContents && enhancedMessages.length > 0) {
    enhancedMessages[0] = {
      ...enhancedMessages[0],
      content: enhancedMessages[0].content + "\n\nHere is the actual page content I pre-fetched for you:\n" + pageContents,
    };
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
        messages: enhancedMessages,
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
