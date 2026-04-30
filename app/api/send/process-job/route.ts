import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeNextRetryAt } from "@/lib/sendQueue";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MAX_ATTEMPTS = 5;
const PROCESSING_STALE_MS = 3 * 60 * 1000;

function isStaleProcessing(updatedAt?: string | null) {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > PROCESSING_STALE_MS;
}

function deliveryLooksSuccessful(delivery: any) {
  const status = String(delivery?.status || "").toLowerCase();
  return (
    !!delivery?.provider_message_id ||
    status === "sent" ||
    status === "delivered" ||
    status === "accepted" ||
    status === "queued"
  );
}
async function buildTimelineIntegrityHash(params: {
  projectId: string;
  userId: string;
  lockedEntryIds: number[];
}) {
  const { projectId, userId, lockedEntryIds } = params;

  const sortedLockedIds = [...lockedEntryIds]
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);

  const { data: proofs, error: proofsErr } = await supabaseServer
    .from("proofs")
    .select("id, created_at, locked_at, content")
    .eq("project_id", projectId)
    .in("id", sortedLockedIds)
    .order("id", { ascending: true });

  if (proofsErr) {
    throw new Error(proofsErr.message || "Failed to load proofs for timeline hash");
  }

  const { data: attachments, error: attachmentsErr } = await supabaseServer
    .from("attachments")
    .select("id, proof_id, filename, mime_type, created_at, path")
    .eq("project_id", projectId)
    .in("proof_id", sortedLockedIds)
    .order("proof_id", { ascending: true });

  if (attachmentsErr) {
    throw new Error(attachmentsErr.message || "Failed to load attachments for timeline hash");
  }

  const { data: deliveries, error: deliveriesErr } = await supabaseServer
    .from("message_deliveries")
    .select("id, created_at, status, to_address, send_job_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (deliveriesErr) {
    throw new Error(deliveriesErr.message || "Failed to load deliveries for timeline hash");
  }

  const payload = {
    version: 1,
    projectId,
    lockedEntryIds: sortedLockedIds,
    proofs: (proofs ?? []).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      locked_at: p.locked_at,
      content: p.content ?? "",
    })),
    attachments: (attachments ?? []).map((a) => ({
      id: a.id,
      proof_id: a.proof_id,
      filename: a.filename ?? "",
      mime_type: a.mime_type ?? "",
      created_at: a.created_at ?? "",
      path: a.path ?? "",
    })),
    deliveries: (deliveries ?? []).map((d) => ({
      id: d.id,
      created_at: d.created_at ?? "",
      status: d.status ?? "",
      to_address: d.to_address ?? "",
      send_job_id: d.send_job_id ?? "",
    })),
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function markRetryingOrFailed(
  jobId: string,
  userId: string,
  nextAttemptNumber: number,
  errorMessage: string
) {
  const exhausted = nextAttemptNumber >= MAX_ATTEMPTS;

  await supabaseServer
    .from("send_jobs")
    .update({
      status: exhausted ? "failed" : "retrying",
      last_error: errorMessage,
      last_error_at: new Date().toISOString(),
      next_retry_at: exhausted ? null : computeNextRetryAt(nextAttemptNumber + 1),
    })
    .eq("id", jobId)
    .eq("user_id", userId);

  return exhausted ? "failed" : "retrying";
}

export async function POST(req: Request) {
  let userId = "";
  let jobId = "";
  let nextAttemptNumber = 0;

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!bearer) {
      return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(bearer);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    jobId = String(body?.jobId || "").trim();

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const { data: job, error: jobErr } = await supabaseServer
      .from("send_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Send job not found" }, { status: 404 });
    }

    if (job.status === "sent") {
      return NextResponse.json({ ok: true, status: "sent", alreadyComplete: true });
    }

    if (job.status === "failed") {
      return NextResponse.json(
        { ok: false, status: "failed", error: job.last_error || "Send failed" },
        { status: 400 }
      );
    }

    if (job.next_retry_at && new Date(job.next_retry_at).getTime() > Date.now()) {
      return NextResponse.json({
        ok: true,
        status: job.status,
        waitingUntil: job.next_retry_at,
      });
    }

    // Check whether a prior attempt already created a successful delivery.
    // This lets us safely resume finalization without sending duplicate email.
    const { data: latestDelivery } = await supabaseServer
      .from("message_deliveries")
      .select("*")
      .eq("send_job_id", jobId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const alreadyDelivered = deliveryLooksSuccessful(latestDelivery);

    // If job is "processing" but not stale, only short-circuit when there is no
    // evidence that email already succeeded. If delivery exists, continue so we
    // can finalize entries and mark the job sent.
    if (
      job.status === "processing" &&
      !isStaleProcessing(job.updated_at) &&
      !alreadyDelivered
    ) {
      return NextResponse.json({ ok: true, status: "processing", alreadyRunning: true });
    }

    nextAttemptNumber = Number(job.attempt_count || 0) + 1;

    await supabaseServer
      .from("send_jobs")
      .update({
        status: alreadyDelivered ? "finalizing" : "processing",
        attempt_count: nextAttemptNumber,
        started_at: job.started_at || new Date().toISOString(),
        last_error: null,
        last_error_at: null,
        next_retry_at: null,
      })
      .eq("id", jobId)
      .eq("user_id", userId);

    const baseUrl =
      (process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

    let emailJson: any = {};
    let effectiveShareId = null;
    let effectiveShareUrl = null;

    if (!alreadyDelivered) {
      let emailRes: Response;

      try {
        emailRes = await fetch(`${baseUrl}/api/send/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bearer}`,
          },
          body: JSON.stringify({
            projectId: job.project_id,
            toEmail: job.to_email,
            includeArchived: job.include_archived,
            sendJobId: job.id,
            shareUrl: job.share_url,
            shareId: job.share_id,
            skipFinalize: false,
          }),
        });

        emailJson = await emailRes.json().catch(() => ({}));
      } catch (e: any) {
        const newStatus = await markRetryingOrFailed(
          jobId,
          userId,
          nextAttemptNumber,
          e?.message || "fetch failed"
        );

        return NextResponse.json(
          {
            ok: false,
            status: newStatus,
            error: e?.message || "fetch failed",
          },
          { status: newStatus === "failed" ? 500 : 202 }
        );
      }

      if (!emailRes.ok) {
        const newStatus = await markRetryingOrFailed(
          jobId,
          userId,
          nextAttemptNumber,
          emailJson?.error || "Send failed"
        );

        return NextResponse.json(
          {
            ok: false,
            status: newStatus,
            error: emailJson?.error || "Send failed",
          },
          { status: newStatus === "failed" ? 500 : 202 }
        );
      }

      effectiveShareId = emailJson?.shareId || effectiveShareId;
      effectiveShareUrl = emailJson?.shareUrl || effectiveShareUrl;
    }

    const { data: claimedJob, error: claimErr } = await supabaseServer
      .from("send_jobs")
      .update({
        status: alreadyDelivered ? "finalizing" : "processing",
        attempt_count: nextAttemptNumber,
        started_at: job.started_at || new Date().toISOString(),
        last_error: null,
        last_error_at: null,
        next_retry_at: null,
      })
      .eq("id", jobId)
      .eq("user_id", userId)
      .in("status", ["pending", "retrying"])
      .select("id")
      .maybeSingle();

    if (claimErr) {
      throw new Error(claimErr.message || "Failed to claim send job.");
    }

    if (!claimedJob && !alreadyDelivered) {
      return NextResponse.json({
        ok: true,
        status: "processing",
        alreadyRunning: true,
      });
    }

    const lockedIds = Array.isArray(job.locked_entry_ids) ? job.locked_entry_ids : [];

    if (lockedIds.length > 0) {
      const { error: finalizeErr } = await supabaseServer
        .from("proofs")
        .update({ locked_at: new Date().toISOString() })
        .in("id", lockedIds)
        .eq("project_id", job.project_id)
        .is("locked_at", null);

      if (finalizeErr) {
        const newStatus = await markRetryingOrFailed(
          jobId,
          userId,
          nextAttemptNumber,
          finalizeErr.message || "Finalizing entries failed"
        );

        return NextResponse.json(
          {
            ok: false,
            status: newStatus,
            error: finalizeErr.message || "Finalizing entries failed",
          },
          { status: newStatus === "failed" ? 500 : 202 }
        );
      }
    }

    let timelineHash: string | null = null;

    try {
      const lockedIds = Array.isArray(job.locked_entry_ids) ? job.locked_entry_ids : [];

      if (lockedIds.length > 0) {
        timelineHash = await buildTimelineIntegrityHash({
          projectId: job.project_id,
          userId,
          lockedEntryIds: lockedIds,
        });
      }
    } catch (e) {
      console.error("Timeline hash generation failed", e);
    }

    await supabaseServer
      .from("send_jobs")
      .update({
        status: "sent",
        processed_at: new Date().toISOString(),
        timeline_hash: timelineHash,
        last_error: null,
        last_error_at: null,
        next_retry_at: null,
        share_id: effectiveShareId,
        share_url: effectiveShareUrl,
      })
      .eq("id", jobId)
      .eq("user_id", userId);

    return NextResponse.json({
      ok: true,
      status: "sent",
      shareUrl: effectiveShareUrl,
    });
  } catch (e: any) {
    if (jobId && userId && nextAttemptNumber > 0) {
      const newStatus = await markRetryingOrFailed(
        jobId,
        userId,
        nextAttemptNumber,
        e?.message || "Unexpected error processing send job"
      );

      return NextResponse.json(
        {
          ok: false,
          status: newStatus,
          error: e?.message || "Unexpected error processing send job",
        },
        { status: newStatus === "failed" ? 500 : 202 }
      );
    }

    return NextResponse.json(
      { error: e?.message || "Unexpected error processing send job" },
      { status: 500 }
    );
  }
}