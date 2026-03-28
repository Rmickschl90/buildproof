import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabaseServer.auth.getUser(token);

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const approvalId = String(body?.approvalId || "").trim();

    if (!approvalId) {
      return NextResponse.json({ error: "approvalId is required." }, { status: 400 });
    }

    const { data: approval, error: approvalErr } = await supabaseServer
      .from("approval_requests")
      .select("id, project_id, created_by, status")
      .eq("id", approvalId)
      .single();

    if (approvalErr || !approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }

    if (approval.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (approval.status !== "draft") {
      return NextResponse.json({ error: "Only draft approvals can be deleted." }, { status: 400 });
    }

    const { error: deleteErr } = await supabaseServer
      .from("approval_requests")
      .delete()
      .eq("id", approvalId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message || "Failed to delete draft." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete draft." },
      { status: 500 }
    );
  }
}