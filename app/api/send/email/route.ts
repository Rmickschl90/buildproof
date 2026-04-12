import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildProjectPdf } from "@/lib/pdf/buildProjectPdf";
console.log("🔥 EMAIL ROUTE FILE LOADED");

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || "";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5000").replace(/\/+$/, "");

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function toBase64(buf: Uint8Array | Buffer) {
  return Buffer.from(buf).toString("base64");
}

function safeFilename(name: string) {
  return (name || "Project").replace(/[^\w\-]+/g, "_").slice(0, 80);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getOrCreateShareLink(projectId: string, userId: string, includeArchived: boolean) {
  const buildUrl = (token: string) =>
    includeArchived ? `${APP_URL}/share/${token}/archived` : `${APP_URL}/share/${token}`;

  const token = randomUUID();

  const { data: created, error: createErr } = await supabaseServer
    .from("project_shares")
    .insert({
      project_id: projectId,
      created_by: userId,
      token,
    })
    .select("id, token")
    .single();

  if (createErr || !created?.token) {
    throw new Error(createErr?.message || "Failed to create share link");
  }

  return {
    shareId: created.id as string,
    token: created.token as string,
    shareUrl: buildUrl(created.token as string),
  };
}

export async function POST(req: Request) {
  console.log("=== SEND EMAIL ROUTE HIT v2 ===");
  let deliveryId: string | null = null;

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
    const projectId = String(body?.projectId || "");
    const toEmail = String(body?.toEmail || "").trim().toLowerCase();
    const includeArchived = Boolean(body?.includeArchived);
    const providedShareUrl = body?.shareUrl ? String(body.shareUrl).trim() : "";
    const providedShareId = body?.shareId ? String(body.shareId).trim() : "";
    const skipFinalize = Boolean(body?.skipFinalize);
    const sendJobId = body?.sendJobId ? String(body.sendJobId).trim() : "";

    console.log(
      "[send-email] toEmail =",
      JSON.stringify(toEmail),
      "from =",
      JSON.stringify(RESEND_FROM),
      "includeArchived =",
      includeArchived,
      "skipFinalize =",
      skipFinalize,
      "sendJobId =",
      JSON.stringify(sendJobId)
    );

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    if (!toEmail || !isValidEmail(toEmail)) {
      return NextResponse.json({ error: "Invalid toEmail" }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,title,user_id,created_at")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY" }, { status: 500 });
    }

    if (!RESEND_FROM) {
      return NextResponse.json({ error: "Missing RESEND_FROM" }, { status: 500 });
    }

    // ALWAYS create a fresh share for each send (never reuse dashboard share)
    const share = await getOrCreateShareLink(projectId, userId, includeArchived);

    const shareId = share.shareId;
    const shareUrl = share.shareUrl;

    console.log("[send-email] created fresh share", {
      projectId,
      shareId,
      shareUrl,
    });

    if (sendJobId) {
      await supabaseServer
        .from("send_jobs")
        .update({
          share_id: shareId || null,
          share_url: shareUrl || null,
        })
        .eq("id", sendJobId)
        .eq("user_id", userId);
    }

    const title = project.title || "BuildProof Project";
    const messageBody = [
      `Attached is the latest PDF report for: ${title}`,
      "",
      `View online timeline: ${shareUrl}`,
    ].join("\n");

    const { data: deliveryRow, error: deliveryErr } = await supabaseServer
      .from("message_deliveries")
      .insert({
        user_id: userId,
        project_id: projectId,
        send_job_id: sendJobId || null,
        share_id: shareId || null,
        channel: "email",
        to_address: toEmail,
        message_body: messageBody,
        provider: "resend",
        provider_message_id: null,
        status: "sending",
        error: null,
      })
      .select("id")
      .single();

    if (deliveryErr) {
      console.error("[send-email] delivery insert failed", deliveryErr);

      return NextResponse.json(
        {
          error: "delivery insert failed",
          details: deliveryErr.message,
        },
        { status: 500 }
      );
    }

    deliveryId = deliveryRow?.id ?? null;

    const proofsQuery = supabaseServer
      .from(includeArchived ? "proofs" : "proofs_active")
      .select("id,content,created_at,locked_at,project_id,created_timezone_id,created_timezone_offset_minutes")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const { data: proofs, error: proofsErr } = await proofsQuery;

    if (proofsErr) {
      return NextResponse.json({ error: proofsErr.message }, { status: 400 });
    }

    const { data: atts, error: attErr } = await supabaseServer
      .from("attachments")
      .select("id,proof_id,filename,mime_type,path,created_at,project_id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (attErr) {
      return NextResponse.json({ error: attErr.message }, { status: 400 });
    }

    let approvalsQuery = supabaseServer
      .from("approval_requests")
      .select(`
  id,
  project_id,
  title,
  approval_type,
  description,
  cost_delta,
  schedule_delta,
  status,
  created_at,
  sent_at,
  responded_at,
  expired_at,
  archived_at,
  recipient_name,
  recipient_email,
  created_timezone_id,
  created_timezone_offset_minutes
`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!includeArchived) {
      approvalsQuery = approvalsQuery.is("archived_at", null);
    }

    const { data: approvalBaseRows, error: approvalsErr } = await approvalsQuery;

    if (approvalsErr) {
      return NextResponse.json({ error: approvalsErr.message }, { status: 400 });
    }

    const approvalIds = (approvalBaseRows ?? []).map((row) => row.id);

    let approvalAttachmentsRows: any[] = [];

    if (approvalIds.length > 0) {
      const { data: attRows, error: attErr2 } = await supabaseServer
        .from("approval_attachments")
        .select("id,approval_id,filename,mime_type,path,created_at")
        .in("approval_id", approvalIds)
        .order("created_at", { ascending: true });

      if (attErr2) {
        return NextResponse.json({ error: attErr2.message }, { status: 400 });
      }

      approvalAttachmentsRows = attRows ?? [];
    }

    let approvalResponsesRows: any[] = [];

    if (approvalIds.length > 0) {
      const { data: responseRows, error: responsesErr } = await supabaseServer
        .from("approval_responses")
        .select(`
    id,
    approval_request_id,
    decision,
    ip_address,
    user_agent
  `)
        .in("approval_request_id", approvalIds);

      if (responsesErr) {
        return NextResponse.json({ error: responsesErr.message }, { status: 400 });
      }

      approvalResponsesRows = responseRows ?? [];
    }

    const approvals = (approvalBaseRows ?? []).map((approval) => ({
      ...approval,
      approval_responses: approvalResponsesRows.filter(
        (response) => response.approval_request_id === approval.id
      ),
      attachments: approvalAttachmentsRows.filter(
        (a) => a.approval_id === approval.id
      ),
    }));

        // 🔥 Get locked entry ids for THIS send (so PDF matches update pack)
    let lockedEntryIds: number[] = [];

    if (sendJobId) {
      const { data: job } = await supabaseServer
        .from("send_jobs")
        .select("locked_entry_ids")
        .eq("id", sendJobId)
        .maybeSingle();

      if (Array.isArray(job?.locked_entry_ids)) {
        lockedEntryIds = job.locked_entry_ids
          .map((id: any) => Number(id))
          .filter((id: number) => Number.isFinite(id));
      }
    }

        // 🔥 Preview-finalize entries for PDF (do NOT touch DB)
    const finalizedProofs = (proofs ?? []).map((p: any) => {
      if (!p.locked_at && lockedEntryIds.includes(Number(p.id))) {
        return {
          ...p,
          locked_at: new Date().toISOString(), // temporary for PDF only
        };
      }
      return p;
    });

    const { pdfBuffer, filename } = await buildProjectPdf({
      project: { id: project.id, title: project.title, created_at: project.created_at },
      proofs: finalizedProofs,
      attachments: atts ?? [],
      approvals,
      supabase: supabaseServer,
      reportMode: "standard",
    });

    const subject = `Project Update: ${title}`;
    const text = [
      `Hi — attached is the latest project PDF for: ${title}`,
      "",
      "View the live project timeline online:",
      shareUrl,
      "",
      "The PDF is attached for easy download and recordkeeping.",
      "",
      "— Powered by BuildProof",
    ].join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">
        <p style="margin:0 0 14px 0;">Hi — attached is the latest project PDF for: <strong>${escapeHtml(
      title
    )}</strong></p>

        <p style="margin:0 0 10px 0;">View the live project timeline online:</p>

        <p style="margin:0 0 18px 0;">
          <a
            href="${escapeAttr(shareUrl)}"
            style="display:inline-block;padding:10px 14px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            View Project Timeline
          </a>
        </p>

        <p style="margin:0 0 14px 0;color:#334155;">
          The PDF is attached for easy download and recordkeeping.
        </p>

        <p style="margin:18px 0 0 0;color:#64748b;font-size:13px;">
          Powered by BuildProof
        </p>
      </div>
    `;

    const finalFilename = filename || `BuildProof_${safeFilename(title)}.pdf`;

    const resendRes = await fetchWithTimeout(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [toEmail],
          subject,
          text,
          html,
          attachments: [{ filename: finalFilename, content: toBase64(pdfBuffer) }],
        }),
      },
      12_000
    );

    const resendRaw = await resendRes.text().catch(() => "");

    let resendJson: any = {};
    try {
      resendJson = resendRaw ? JSON.parse(resendRaw) : {};
    } catch {
      resendJson = { raw: resendRaw };
    }

    if (!resendRes.ok) {
      console.error("[send-email] Resend error", resendRes.status, resendRaw);

      const msg =
        resendJson?.message ||
        resendJson?.error ||
        resendJson?.raw ||
        `Resend failed (HTTP ${resendRes.status})`;

      if (deliveryId) {
        await supabaseServer
          .from("message_deliveries")
          .update({ status: "failed", error: msg })
          .eq("id", deliveryId);
      }

      return NextResponse.json({ error: msg, resendStatus: resendRes.status }, { status: 500 });
    }

    if (deliveryId) {
      await supabaseServer
        .from("message_deliveries")
        .update({
          status: "sent",
          provider_message_id: resendJson?.id ?? null,
          error: null,
        })
        .eq("id", deliveryId);
    }

    if (!skipFinalize) {
      const lockedAt = new Date().toISOString();

      const { error: finalizeError } = await supabaseServer
        .from("proofs")
        .update({ locked_at: lockedAt })
        .eq("project_id", projectId)
        .is("locked_at", null)
        .is("deleted_at", null);

      if (finalizeError) {
        console.error("[send-email] finalize drafts error:", finalizeError);

        if (deliveryId) {
          await supabaseServer
            .from("message_deliveries")
            .update({
              status: "sent",
              error: "Email sent, but finalizing entries failed.",
            })
            .eq("id", deliveryId);
        }

        return NextResponse.json(
          { error: "Email sent, but finalizing entries failed." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      provider: "resend",
      id: resendJson?.id ?? null,
      deliveryId,
      shareId,
      shareUrl,
      finalized: !skipFinalize,
    });
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Resend request timed out" : e?.message ?? "Send failed";

    if (deliveryId) {
      await supabaseServer
        .from("message_deliveries")
        .update({ status: "failed", error: msg })
        .eq("id", deliveryId);
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function escapeHtml(input: string) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(input: string) {
  return escapeHtml(input).replace(/"/g, "&quot;");
}