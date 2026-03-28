import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

// POST body: { projectId: string, title?: string }
export async function POST(req: Request) {
  try {
    // ✅ AUTH PROTECTION — verifies logged-in user
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const { projectId, title } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Optional: you now have access to user.id if needed
    // Example future use:
    // user_id: user.id,

    const { data, error } = await supabaseServer
      .from("proofs")
      .insert({
        project_id: projectId,
        title: title ?? null,
        is_locked: false,
        // user_id: user.id, // add later if your table has this column
      })
      .select("id, project_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ proofId: data.id, projectId: data.project_id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
