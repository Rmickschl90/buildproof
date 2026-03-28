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
    const jobId = String(url.searchParams.get("id") || "").trim();

    if (!jobId) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: job, error } = await supabaseServer
      .from("send_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Send job not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error reading send job" },
      { status: 500 }
    );
  }
}