import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { JobLogger } from "@/lib/pipeline/log";
import { runDiscovery, runDiscoveryCleanup } from "@/lib/pipeline/discovery";
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

  const job = new URL(req.url).searchParams.get("job");
  const logger = new JobLogger(`admin-${job || "unknown"}`);
  try {
    if (job === "discover") {
      const result = await runDiscovery(logger);
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    if (job === "cleanup") {
      const result = await runDiscoveryCleanup(logger);
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    if (job === "ingest") {
      const result = await runIngestBatch(logger);
      return NextResponse.json({ ok: true, result, log: logger.summary() });
    }
    return NextResponse.json({ error: "unknown job (use ?job=discover|ingest|cleanup)" }, { status: 400 });
  } catch (e: any) {
    logger.error("admin_run.fatal", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message, log: logger.summary() }, { status: 500 });
  }
}
