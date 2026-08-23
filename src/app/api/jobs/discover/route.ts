import { NextRequest, NextResponse } from "next/server";
import { checkWorkerAuth } from "@/lib/pipeline/auth";
import { JobLogger } from "@/lib/pipeline/log";
import { runDiscovery, runDiscoveryCleanup } from "@/lib/pipeline/discovery";

// Discovery worker (Agent 1). Protected by WORKER_SECRET. Triggered by pg_cron
// or manually. Rotates through the configured sources a few at a time.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authError = checkWorkerAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const params = new URL(req.url).searchParams;
  // Dry run (?dryRun=1) writes nothing (works for both the sweep and cleanup).
  const dryRun = params.get("dryRun") === "1";
  // Cleanup (?cleanup=1) re-applies the window rules to existing discovered rows
  // instead of running a fresh discovery sweep.
  const cleanup = params.get("cleanup") === "1";

  const logger = new JobLogger(cleanup ? "discovery-cleanup" : "discover");
  try {
    const result = cleanup
      ? await runDiscoveryCleanup(logger, { dryRun })
      : await runDiscovery(logger, { dryRun });
    return NextResponse.json({ ok: true, result, log: logger.summary() });
  } catch (e: any) {
    logger.error("discover.fatal", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message, log: logger.summary() }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // convenience for manual browser/curl trigger with ?secret=
