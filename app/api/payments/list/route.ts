import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { projectId }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(user.id, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data: payments, error: paymentsError } = await supabaseServer
      .from("project_payments")
      .select("id, project_id, amount, note, paid_at, created_at, created_by")
      .eq("project_id", projectId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (paymentsError) {
      return NextResponse.json(
        { error: paymentsError.message || "Failed to load payments." },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: payments ?? [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
