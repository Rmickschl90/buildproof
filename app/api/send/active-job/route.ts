import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!bearer) {
      return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(bearer);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = userData.user.id;
    const url = new URL(req.url);
    const projectId = String(url.searchParams.get("projectId") || "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: job, error } = await supabaseServer
      .from("send_jobs")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .in("status", ["pending", "processing", "retrying"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job: job ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error reading active send job" },
      { status: 500 }
    );
  }
}