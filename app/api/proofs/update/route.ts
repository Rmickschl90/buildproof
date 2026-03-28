import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });

    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const proofId = body?.proofId;

    const content = typeof body?.content === "string" ? body.content : "";
    const trimmed = content.trim();

    if (proofId === undefined || proofId === null || proofId === "") {
      return NextResponse.json({ error: "Missing proofId" }, { status: 400 });
    }
    if (!trimmed) {
      return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
    }

    // Load proof
    const { data: proof, error: proofErr } = await supabaseServer
      .from("proofs")
      .select("id, project_id, locked_at")
      .eq("id", proofId)
      .maybeSingle();

    if (proofErr) return NextResponse.json({ error: proofErr.message }, { status: 400 });
    if (!proof) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    if (proof.locked_at) {
      return NextResponse.json({ error: "Entry is finalized and cannot be edited" }, { status: 409 });
    }

    // Ownership check
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", proof.project_id)
      .maybeSingle();

    if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 400 });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Update (trigger will set updated_at)
    const { error: updErr } = await supabaseServer
      .from("proofs")
      .update({ content: trimmed })
      .eq("id", proofId)
      .is("locked_at", null);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}