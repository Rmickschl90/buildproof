import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { paymentId }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();
    const paymentId = String(body?.paymentId ?? "").trim();

    if (!paymentId) {
      return NextResponse.json({ error: "Missing paymentId." }, { status: 400 });
    }

    const { data: payment, error: paymentErr } = await supabaseServer
      .from("project_payments")
      .select("id, project_id")
      .eq("id", paymentId)
      .single();

    if (paymentErr || !payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, payment.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { error: deleteErr } = await supabaseServer
      .from("project_payments")
      .delete()
      .eq("id", paymentId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
