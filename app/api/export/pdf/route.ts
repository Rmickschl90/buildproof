import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildProjectPdf } from "@/lib/pdf/buildProjectPdf";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "");
    const includeArchived = Boolean(body?.includeArchived);
    const reportMode =
      body?.reportMode === "dispute" ? "dispute" : "standard";

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,title,created_at,client_name,client_email,tax_rate")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔒 ALWAYS use latest sent snapshot (no drafts ever)

    const { data: latestSentJob } = await supabaseServer
      .from("send_jobs")
      .select("locked_entry_ids, processed_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "sent")
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lockedEntryIds = Array.isArray(latestSentJob?.locked_entry_ids)
      ? latestSentJob.locked_entry_ids
        .map((id: any) => Number(id))
        .filter((id: number) => Number.isFinite(id))
      : [];

    let proofsQuery = supabaseServer
      .from("proofs")
      .select("id,content,created_at,locked_at,project_id,created_timezone_id,created_timezone_offset_minutes")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (lockedEntryIds.length > 0) {
      proofsQuery = proofsQuery.in("id", lockedEntryIds);
    } else {
      proofsQuery = proofsQuery.in("id", [-1]);
    }

    const { data: proofs, error: proofsErr } = await proofsQuery;

    if (proofsErr) {
      return NextResponse.json({ error: proofsErr.message }, { status: 400 });
    }

    const { data: attachments, error: attErr } = await supabaseServer
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
  line_items,
  is_baseline,
  schedule_delta,
  status,
  created_at,
  sent_at,
  responded_at,
  expired_at,
  archived_at,
  recipient_name,
  recipient_email,
  recipient_source,
  created_timezone_id,
  created_timezone_offset_minutes
`)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (reportMode !== "dispute") {
      approvalsQuery = approvalsQuery
        .is("archived_at", null)
        .in("status", ["pending", "approved", "declined"]);
    } else {
      approvalsQuery = approvalsQuery
        .in("status", ["pending", "approved", "declined"]);
    }

    const { data: approvalBaseRows, error: approvalsErr } = await approvalsQuery;

    if (approvalsErr) {
      return NextResponse.json({ error: approvalsErr.message }, { status: 400 });
    }

    const approvalIds = (approvalBaseRows ?? []).map((row: any) => row.id);
    let approvalAttachmentsRows: any[] = [];

    if (approvalIds.length > 0) {
      const { data: attRows, error: attErr } = await supabaseServer
        .from("approval_attachments")
        .select("id,approval_id,project_id,filename,mime_type,path,created_at")
        .in("approval_id", approvalIds)
        .order("created_at", { ascending: true });

      if (attErr) {
        return NextResponse.json({ error: attErr.message }, { status: 400 });
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

    const approvals = (approvalBaseRows ?? []).map((approval: any) => ({
      ...approval,
      approval_responses: approvalResponsesRows.filter(
        (response) => response.approval_request_id === approval.id
      ),
      attachments: approvalAttachmentsRows.filter(
        (att) => att.approval_id === approval.id
      ),
    }));

    let deliveries: any[] = [];
    let contactEvents: any[] = [];
    let shareViews: any[] = [];
    let payments: any[] = [];
    let referenceDocuments: any[] = [];
    let timelineHash: string | null = null;

    if (reportMode === "dispute") {
      const { data: deliveryRows, error: deliveriesErr } = await supabaseServer
        .from("message_deliveries")
        .select("id,project_id,status,to_address,error,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (deliveriesErr) {
        return NextResponse.json({ error: deliveriesErr.message }, { status: 400 });
      }

      deliveries = deliveryRows ?? [];

      const { data: contactEventRows, error: contactEventsErr } = await supabaseServer
        .from("project_contact_events")
        .select("id,project_id,user_id,event_type,previous_email,new_email,created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (contactEventsErr) {
        return NextResponse.json({ error: contactEventsErr.message }, { status: 400 });
      }

      contactEvents = contactEventRows ?? [];

      const { data: shareViewRows, error: shareViewsErr } = await supabaseServer
        .from("share_views")
        .select("id,project_id,share_token,viewed_at,ip_address")
        .eq("project_id", projectId)
        .order("viewed_at", { ascending: true });

      if (shareViewsErr) {
        return NextResponse.json({ error: shareViewsErr.message }, { status: 400 });
      }

      shareViews = shareViewRows ?? [];

      const { data: paymentRows, error: paymentsErr } = await supabaseServer
        .from("project_payments")
        .select("id,amount,note,paid_at")
        .eq("project_id", projectId)
        .order("paid_at", { ascending: true });

      if (paymentsErr) {
        return NextResponse.json({ error: paymentsErr.message }, { status: 400 });
      }

      payments = paymentRows ?? [];

      // Reference Documents -- Documents-tab files explicitly opted in via
      // their own "Include in dispute packet" toggle (see project_documents
      // migration). Deliberately separate from the Timeline/approval
      // "Supporting Documents" exhibit section built further down --
      // evidentiary attachments are always included automatically, these
      // are opt-in only, since they may describe the record generally
      // (leases, insurance certs) rather than proving a specific moment.
      const { data: referenceDocRows, error: referenceDocsErr } = await supabaseServer
        .from("project_documents")
        .select("id,project_id,path,filename,mime_type,size_bytes,label,created_at")
        .eq("project_id", projectId)
        .eq("include_in_dispute_packet", true)
        .order("created_at", { ascending: true });

      if (referenceDocsErr) {
        return NextResponse.json({ error: referenceDocsErr.message }, { status: 400 });
      }

      referenceDocuments = referenceDocRows ?? [];

      const { data: latestSentJob, error: latestSentJobErr } = await supabaseServer
        .from("send_jobs")
        .select("timeline_hash,processed_at")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .eq("status", "sent")
        .not("timeline_hash", "is", null)
        .order("processed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSentJobErr) {
        return NextResponse.json({ error: latestSentJobErr.message }, { status: 400 });
      }

      timelineHash = latestSentJob?.timeline_hash || null;
    }

    const { pdfBuffer, filename } = await buildProjectPdf({
      project: {
        id: project.id,
        title: project.title,
        created_at: project.created_at,
        client_name: project.client_name,
        client_email: project.client_email,
      },
      proofs: proofs ?? [],
      attachments: attachments ?? [],
      approvals,
      deliveries,
      contactEvents,
      shareViews,
      payments,
      referenceDocuments,
      timelineHash,
      supabase: supabaseServer,
      reportMode,
    });

    const copied = Uint8Array.from(pdfBuffer);
    const ab: ArrayBuffer = copied.buffer;

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Export failed" }, { status: 500 });
  }
}