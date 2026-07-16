import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canUserAccessProject } from "@/lib/organizationAuth";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const approvalId = String(body?.approvalId ?? "").trim();

    if (!approvalId) {
      return NextResponse.json({ error: "Missing approvalId." }, { status: 400 });
    }

    const { data: approval, error: approvalError } = await supabaseServer
      .from("approval_requests")
      .select("id, project_id")
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", approval.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(user.id, approval.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const restore = body?.restore === true;

    const { error: updateError } = await supabaseServer
      .from("approval_requests")
      .update({
        archived_at: restore ? null : new Date().toISOString(),
      })
      .eq("id", approvalId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected error." },
      { status: 500 }
    );
  }
}