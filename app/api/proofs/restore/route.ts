import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const proofId = Number(body?.proofId);

    if (!proofId) {
      return NextResponse.json({ error: "Missing proofId" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("proofs")
      .update({
        deleted_at: null,
        deleted_by: null,
      })
      .eq("id", proofId)
      .not("deleted_at", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Restore failed" },
      { status: 500 }
    );
  }
}