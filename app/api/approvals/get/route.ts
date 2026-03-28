import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const approvalId = String(body?.approvalId ?? "").trim();

    if (!approvalId) {
      return NextResponse.json({ error: "Missing approvalId." }, { status: 400 });
    }

    const { data: approval, error } = await supabaseServer
      .from("approval_requests")
      .select("*")
      .eq("id", approvalId)
      .single();

    if (error || !approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }

    if (approval.created_by !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    return NextResponse.json({ approval });
  } catch (error) {
    console.error("[approvals/get] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}