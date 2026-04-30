import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { buildProjectPdf } from "../../../../../lib/pdf/buildProjectPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // 1) Validate share link
    const { data: share, error: shareErr } = await supabaseServer
      .from("project_shares")
      .select("id, project_id, revoked_at, token")
      .eq("token", token)
      .maybeSingle();

    if (shareErr) {
      return NextResponse.json(
        { error: shareErr.message },
        { status: 500 }
      );
    }

    if (!share) {
      return NextResponse.json(
        { error: "Share link not found" },
        { status: 404 }
      );
    }

    if (share.revoked_at) {
      return NextResponse.json(
        { error: "Share link has been revoked" },
        { status: 410 } // 410 = Gone (perfect semantic fit)
      );
    }

    const projectId = share.project_id;

    // 2) Fetch project
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,title,created_at")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 3) Fetch proofs
    const { data: proofs, error: proofsErr } = await supabaseServer
      .from("proofs_active")
      .select("id,content,created_at,locked_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (proofsErr) {
      return NextResponse.json({ error: proofsErr.message }, { status: 400 });
    }

    // 4) Fetch attachments
    const { data: attachments, error: attErr } = await supabaseServer
      .from("attachments")
      .select("id,proof_id,filename,mime_type,path,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (attErr) {
      return NextResponse.json({ error: attErr.message }, { status: 400 });
    }

    const { data: approvals, error: approvalsErr } = await supabaseServer
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
    recipient_source,
    created_timezone_id,
    created_timezone_offset_minutes
  `)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (approvalsErr) {
      return NextResponse.json({ error: approvalsErr.message }, { status: 400 });
    }

    // 5) Build PDF
    const { pdfBuffer, filename } = await buildProjectPdf({
      project: {
        id: project.id,
        title: project.title,
        created_at: project.created_at,
      },
      proofs: (proofs ?? []) as any,
      attachments: (attachments ?? []) as any,
      approvals: (approvals ?? []) as any,
      supabase: supabaseServer,
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Export failed" },
      { status: 500 }
    );
  }
}
