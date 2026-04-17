import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();
    const includeArchived = body?.includeArchived === true;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    let query = supabaseServer
      .from("approval_requests")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (!includeArchived) {
      query = query.is("archived_at", null);
    }

    const { data: approvals, error: approvalsError } = await query;

    if (approvalsError) {
      return NextResponse.json(
        { error: approvalsError.message || "Failed to load approvals." },
        { status: 500 }
      );
    }

    const approvalIds = (approvals ?? []).map((approval) => approval.id);

    let attachmentsByApprovalId: Record<string, any[]> = {};

    if (approvalIds.length > 0) {
      const { data: attachmentRows, error: attachmentRowsError } = await supabaseServer
        .from("approval_attachments")
        .select("*")
        .in("approval_id", approvalIds)
        .order("created_at", { ascending: true });

      if (attachmentRowsError) {
        return NextResponse.json(
          { error: attachmentRowsError.message || "Failed to load approval attachments." },
          { status: 500 }
        );
      }

      attachmentsByApprovalId = {};

      for (const row of attachmentRows ?? []) {
        if (!row.approval_id) continue;

        if (!attachmentsByApprovalId[row.approval_id]) {
          attachmentsByApprovalId[row.approval_id] = [];
        }

        attachmentsByApprovalId[row.approval_id].push(row);
      }
    }

    const approvalsWithAttachments = (approvals ?? []).map((approval: any) => ({
      ...approval,
      attachments: attachmentsByApprovalId[approval.id] ?? [],
    }));

    return NextResponse.json({ approvals: approvalsWithAttachments });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}