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

    const { data: latestJob } = await supabaseServer
      .from("send_jobs")
      .select("id, status, created_at, processed_at, share_url")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestDelivery } = await supabaseServer
      .from("message_deliveries")
      .select("id, status, to_address, created_at, provider_message_id, error")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("channel", "email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      latestJob: latestJob ?? null,
      latestDelivery: latestDelivery ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected error reading send status summary" },
      { status: 500 }
    );
  }
}