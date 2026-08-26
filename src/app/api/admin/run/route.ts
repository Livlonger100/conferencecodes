import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { JobLogger } from "@/lib/pipeline/log";
import { runDiscovery, runDiscoveryCleanup, runDiscoverySingle, runDiscoveryQuery } from "@/lib/pipeline/discovery";
import { runIngestBatch } from "@/lib/pipeline/ingest";

// Admin-authenticated job triggers. Uses the admin session cookie (set at login)
// so the UI does not need the WORKER_SECRET. The raw /api/jobs/* endpoints still
// require WORKER_SECRET for cron and external callers.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  const sourceId = url.searchParams.get("sourceId");
  const logger = new JobLogger(`admin-${job || "unknown"}`);
  try {
    if (job === "discover") {
      // ?q=<query> runs a single on-demand search from the admin form.
      // ?sourceId=<id> runs one saved source. Otherwise the normal rotating batch.
      const q = url.searchParams.get("q");
      const region = url.searchParams.get("region") || "Global";
      const result = q
        ? await runDiscoveryQuery(q, region, logger)
        : sourceId
        ? await runDiscoverySingle(sourceId, logger)
        : await runDiscovery(logger);
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    if (job === "cleanup") {
      const result = await runDiscoveryCleanup(logger);
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    if (job === "ingest") {
      // ?id=<candidate id> scrapes just that one queued candidate.
      // ?force=1 bypasses the page cache (admin Re-scrape of a changed page).
      const onlyId = url.searchParams.get("id");
      const forceRefresh = url.searchParams.get("force") === "1";
      const result = await runIngestBatch(logger, { ...(onlyId ? { onlyId } : {}), forceRefresh });
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    return NextResponse.json({ error: "unknown job (use ?job=discover|ingest|cleanup)" }, { status: 400 });
  } catch (e: any) {
    logger.error("admin_run.fatal", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message, log: logger.summary() }, { status: 500 });
  }
}
