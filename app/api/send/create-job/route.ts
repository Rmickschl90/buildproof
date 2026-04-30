import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isUniqueViolation(message?: string | null) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("duplicate key") ||
    m.includes("unique constraint") ||
    m.includes("violates unique constraint")
  );
}

export async function POST(req: Request) {
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

    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "").trim();
    const includeArchived = Boolean(body?.includeArchived);
    const toEmail = String(body?.toEmail || "").trim().toLowerCase();
    const idempotencyKey =
      typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim()
        : null;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    if (!toEmail || !isValidEmail(toEmail)) {
      return NextResponse.json({ error: "Invalid toEmail" }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id, user_id, title")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (idempotencyKey) {
      const { data: existingByKey, error: existingByKeyErr } = await supabaseServer
        .from("send_jobs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingByKeyErr) {
        return NextResponse.json({ error: existingByKeyErr.message }, { status: 500 });
      }

      if (existingByKey) {
        return NextResponse.json({
          ok: true,
          reused: true,
          existing: true,
          job: {
            id: existingByKey.id,
            status: existingByKey.status,
          },
          jobId: existingByKey.id,
          status: existingByKey.status,
        });
      }
    }

    const { data: existingJob, error: existingJobErr } = await supabaseServer
      .from("send_jobs")
      .select("id, status, to_email")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .in("status", ["pending", "processing", "retrying"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJobErr) {
      return NextResponse.json({ error: existingJobErr.message }, { status: 500 });
    }

    if (existingJob) {
      // 🔴 HARD PROTECTION: never allow duplicate active jobs
      return NextResponse.json({
        ok: true,
        reused: true,
        existing: true,
        message: "Active send already exists for this project",
        job: {
          id: existingJob.id,
          status: existingJob.status,
          toEmail: existingJob.to_email,
        },
        jobId: existingJob.id,
        status: existingJob.status,
      });
    }

    const proofsSource = includeArchived ? "proofs" : "proofs_active";

    const { data: proofs, error: proofsErr } = await supabaseServer
      .from(proofsSource)
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (proofsErr) {
      return NextResponse.json({ error: proofsErr.message }, { status: 400 });
    }

    const lockedEntryIds = (proofs || []).map((p: any) => p.id);

    // 🔥 Guard: wait for latest proof to exist
    if (lockedEntryIds.length === 0) {
      return NextResponse.json(
        { error: "Entries still syncing — try again in a moment." },
        { status: 409 }
      );
    }

    // ✅ Create a dedicated share link for this send
    const { data: newShare, error: shareErr } = await supabaseServer
      .from("project_shares")
      .insert({
        project_id: projectId,
        created_at: new Date().toISOString(),
      })
      .select("id, token")
      .single();

    if (shareErr || !newShare) {
      return NextResponse.json(
        { error: shareErr?.message || "Failed to create share link" },
        { status: 500 }
      );
    }

    const shareId = newShare.id;
    const shareToken = newShare.token;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://buildproof-kappa.vercel.app";

    const shareUrl = `${baseUrl}/share/${shareToken}`;

    const { data: job, error: insertErr } = await supabaseServer
      .from("send_jobs")
      .insert({
        user_id: userId,
        project_id: projectId,
        status: "pending",
        attempt_count: 0,
        include_archived: includeArchived,
        to_email: toEmail,
        email_subject: null,
        email_message: null,
        locked_entry_ids: lockedEntryIds,
        share_id: shareId,
        share_url: shareUrl,
        next_retry_at: new Date().toISOString(),
        idempotency_key: idempotencyKey,
      })
      .select("id, status")
      .single();

    if (insertErr && idempotencyKey && isUniqueViolation(insertErr.message)) {
      const { data: racedExisting, error: racedExistingErr } = await supabaseServer
        .from("send_jobs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (racedExistingErr) {
        return NextResponse.json({ error: racedExistingErr.message }, { status: 500 });
      }

      if (racedExisting) {
        return NextResponse.json({
          ok: true,
          reused: true,
          existing: true,
          job: {
            id: racedExisting.id,
            status: racedExisting.status,
          },
          jobId: racedExisting.id,
          status: racedExisting.status,
        });
      }
    }

    if (insertErr || !job) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create send job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      existing: false,
      job: {
        id: job.id,
        status: job.status,
      },
      jobId: job.id,
      status: job.status,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error creating send job" },
      { status: 500 }
    );
  }
}