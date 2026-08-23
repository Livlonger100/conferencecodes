import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkWorkerAuth } from "@/lib/pipeline/auth";
import { INGEST_BATCH_SIZE } from "@/lib/pipeline/config";
import { JobLogger } from "@/lib/pipeline/log";
import { runExtraction, writeConference } from "@/lib/pipeline/ingest";
import type { Candidate } from "@/lib/pipeline/types";

// Ingestion worker (Agent 2). Protected by WORKER_SECRET. Processes only a
// SMALL BATCH of "approved" candidates per invocation so it never approaches
// the Vercel function timeout; cron ticks repeatedly to drain the queue.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authError = checkWorkerAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const logger = new JobLogger("ingest");

  // Single-candidate test: ?id=<candidate id> processes just that one approved
  // candidate. Otherwise a small batch of approved candidates (oldest first).
  const onlyId = new URL(req.url).searchParams.get("id");

  let query = supabaseAdmin
    .from("discovery_queue")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(onlyId ? 1 : INGEST_BATCH_SIZE);
  if (onlyId) query = query.eq("id", onlyId);
  const { data: batch, error } = await query;

  if (error) {
    logger.error("ingest.claim_failed", { error: error.message });
    return NextResponse.json({ ok: false, error: error.message, log: logger.summary() }, { status: 500 });
  }

  const candidates = (batch ?? []) as Candidate[];
  logger.info("ingest.start", { batchSize: candidates.length, limit: onlyId ? 1 : INGEST_BATCH_SIZE, onlyId: onlyId ?? null });

  const results: Array<{ id: string; name: string; status: string; tier: string | null; confidence?: number; likelyIncomplete?: boolean; reason?: string }> = [];

  for (const candidate of candidates) {
    logger.info("ingest.item", { id: candidate.id, name: candidate.name, url: candidate.url });
    try {
      const extraction = await runExtraction(candidate.url, logger);

      if (!extraction.ok || !extraction.data) {
        const reason = extraction.errors.join("; ") || "extraction failed";
        await supabaseAdmin
          .from("discovery_queue")
          .update({ status: "failed", notes: reason, tier_used: extraction.tier, updated_at: new Date().toISOString() })
          .eq("id", candidate.id);
        logger.warn("ingest.failed", { id: candidate.id, reason });
        results.push({ id: candidate.id, name: candidate.name, status: "failed", tier: extraction.tier, reason });
        continue;
      }

      const conferenceId = await writeConference(
        extraction.data,
        { sourceCandidate: candidate, completeness: extraction.completeness! },
        logger
      );

      // Surface the completeness note on the candidate row so it shows in the
      // /admin/candidates list without any admin UI change.
      await supabaseAdmin
        .from("discovery_queue")
        .update({
          status: "ingested",
          conference_id: conferenceId,
          tier_used: extraction.tier,
          notes: extraction.completeness?.note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);

      logger.info("ingest.success", { id: candidate.id, conferenceId, tier: extraction.tier, confidence: extraction.completeness?.score, likelyIncomplete: extraction.completeness?.likelyIncomplete });
      results.push({ id: candidate.id, name: candidate.name, status: "ingested", tier: extraction.tier, confidence: extraction.completeness?.score, likelyIncomplete: extraction.completeness?.likelyIncomplete });
    } catch (e: any) {
      const reason = e?.message || "unexpected error";
      await supabaseAdmin
        .from("discovery_queue")
        .update({ status: "failed", notes: reason, updated_at: new Date().toISOString() })
        .eq("id", candidate.id);
      logger.error("ingest.exception", { id: candidate.id, reason });
      results.push({ id: candidate.id, name: candidate.name, status: "failed", tier: null, reason });
    }
  }

  // Report whether more approved work remains so you know to tick again.
  const { count } = await supabaseAdmin
    .from("discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  logger.info("ingest.done", { processed: results.length, remainingApproved: count ?? 0 });
  return NextResponse.json({
    ok: true,
    processed: results.length,
    remainingApproved: count ?? 0,
    results,
    log: logger.summary(),
  });
}

export const POST = handle;
export const GET = handle;
