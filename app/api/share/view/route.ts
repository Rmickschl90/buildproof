import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token || "");
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const { data: share, error: shareErr } = await supabaseServer
      .from("project_shares")
      .select("id,project_id,revoked_at,created_at")
      .eq("token", token)
      .single();

    if (shareErr || !share) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (share.revoked_at) return NextResponse.json({ error: "Revoked" }, { status: 403 });

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,title,created_at")
      .eq("id", share.project_id)
      .single();

    if (projectErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

        const { data: proofs, error: proofsErr } = await supabaseServer
      .from("proofs")
      .select(
        "id,content,created_at,project_id,locked_at,created_timezone_id,created_timezone_offset_minutes"
      )
      .eq("project_id", share.project_id)
      .order("created_at", { ascending: false });

    if (proofsErr) return NextResponse.json({ error: proofsErr.message }, { status: 400 });

    // Attachments for all proofs in this project
    const { data: attachments, error: attErr } = await supabaseServer
      .from("attachments")
      .select("id,proof_id,filename,mime_type,size_bytes,created_at,path")
      .eq("project_id", share.project_id)
      .order("created_at", { ascending: false });

    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });

    // Create signed URLs (short-lived) so the share page can open attachments safely
    const withUrls = await Promise.all(
      (attachments ?? []).map(async (a: any) => {
        const { data } = await supabaseServer.storage
          .from("attachments")
          .createSignedUrl(a.path, 60); // 60s
        return { ...a, signed_url: data?.signedUrl ?? null };
      })
    );

    return NextResponse.json({
      ok: true,
      project,
      proofs: proofs ?? [],
      attachments: withUrls,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "View failed" }, { status: 500 });
  }
}
