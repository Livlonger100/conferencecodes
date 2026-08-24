import { NextRequest, NextResponse } from "next/server";
import { checkWorkerAuth } from "@/lib/pipeline/auth";
import { JobLogger } from "@/lib/pipeline/log";
import { runIngestBatch } from "@/lib/pipeline/ingest";

// Ingestion worker (Agent 2). Protected by WORKER_SECRET for the cron/external
// path. Processes only a SMALL BATCH per invocation so it never approaches the
// Vercel function timeout; cron ticks repeatedly to drain the queue.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authError = checkWorkerAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  // Single-candidate test: ?id=<candidate id> processes just that one approved
  // candidate. Otherwise a small batch.
  const onlyId = new URL(req.url).searchParams.get("id");

  const logger = new JobLogger("ingest");
  try {
    const r = await runIngestBatch(logger, { onlyId });
    return NextResponse.json({ ok: true, ...r, log: logger.summary() });
  } catch (e: any) {
    logger.error("ingest.fatal", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message, log: logger.summary() }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
