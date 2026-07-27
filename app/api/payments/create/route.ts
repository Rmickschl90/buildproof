import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { projectId, amount, note?, paidAt?, creatingUserId? }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();

    const projectId = String(body?.projectId ?? "").trim();
    const amount = Number(body?.amount);
    const note =
      typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    const paidAt =
      typeof body?.paidAt === "string" && body.paidAt.trim() ? body.paidAt.trim() : null;
    let creatingUserId =
      typeof body?.creatingUserId === "string" && body.creatingUserId
        ? body.creatingUserId
        : userId;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number." },
        { status: 400 }
      );
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    // A client-supplied creatingUserId is only trusted if that user genuinely
    // has access to this project (individual owner or active org member) -
    // otherwise it falls back to the authenticated caller, matching the
    // attribution-at-queue-time pattern used for offline attachments/approvals.
    if (
      creatingUserId !== userId &&
      !(await canUserAccessProject(creatingUserId, projectId))
    ) {
      creatingUserId = userId;
    }

    const insertPayload: Record<string, unknown> = {
      project_id: projectId,
      amount,
      note,
      created_by: creatingUserId,
    };

    if (paidAt) {
      insertPayload.paid_at = paidAt;
    }

    const { data, error } = await supabaseServer
      .from("project_payments")
      .insert(insertPayload)
      .select("id, project_id, amount, note, paid_at, created_at, created_by")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ payment: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
