import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildProjectPdf } from "@/lib/pdf/buildProjectPdf";
import { requireUser } from "@/lib/requireUser";

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
      .select("id,title,user_id,created_at,client_name,client_email")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const proofsSource =
      reportMode === "dispute"
        ? "proofs"
        : includeArchived
          ? "proofs"
          : "proofs_active";

    const { data: proofs, error: proofsErr } = await supabaseServer
      .from(proofsSource)
      .select("id,content,created_at,locked_at,project_id,created_timezone_id,created_timezone_offset_minutes")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

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
        .select("id,project_id,share_token,viewed_at")
        .eq("project_id", projectId)
        .order("viewed_at", { ascending: true });

      if (shareViewsErr) {
        return NextResponse.json({ error: shareViewsErr.message }, { status: 400 });
      }

      shareViews = shareViewRows ?? [];

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