import { NextRequest, NextResponse } from "next/server";
import { checkWorkerAuth } from "@/lib/pipeline/auth";
import { JobLogger } from "@/lib/pipeline/log";
import { runDiscovery } from "@/lib/pipeline/discovery";

// Discovery worker (Agent 1). Protected by WORKER_SECRET. Triggered by pg_cron
// or manually. Rotates through the configured sources a few at a time.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authError = checkWorkerAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  // Dry run (?dryRun=1) runs the full sweep + window filter but writes nothing
  // and does not advance the source rotation. Use it to verify the date window.
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const logger = new JobLogger("discover");
  try {
    const result = await runDiscovery(logger, { dryRun });
    return NextResponse.json({ ok: true, result, log: logger.summary() });
  } catch (e: any) {
    logger.error("discover.fatal", { error: e?.message });
    return NextResponse.json({ ok: false, error: e?.message, log: logger.summary() }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // convenience for manual browser/curl trigger with ?secret=
