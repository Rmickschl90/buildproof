import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getPublicBaseUrl(req: Request) {
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  if (env) return env.replace(/\/+$/, "");
  const url = new URL(req.url);
  return url.origin;
}

export async function POST(req: Request) {
  try {
    // 1) AUTH via Bearer token (matches your client + other routes)
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization token" }, { status: 401 });
    }

    const supabaseAnon = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = userData.user.id;

    // 2) BODY
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "");
    const limitRaw = Number(body?.limit ?? 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 10), 200) : 25;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // 3) OWNERSHIP CHECK
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,user_id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 4) LOAD DELIVERIES (NO JOIN — robust)
    const { data: deliveries, error: delErr } = await supabaseServer
      .from("message_deliveries")
      .select("id,created_at,channel,to_address,status,provider,provider_message_id,error,share_id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    const base = getPublicBaseUrl(req);

    // 5) Map share_id -> token with a second query (works even without FK)
    const shareIds = Array.from(
      new Set((deliveries ?? []).map((d: any) => d.share_id).filter(Boolean))
    ) as string[];

    let tokenByShareId: Record<string, string> = {};

    if (shareIds.length > 0) {
      const { data: shares, error: shareErr } = await supabaseServer
        .from("project_shares")
        .select("id, token")
        .in("id", shareIds);

      if (!shareErr && shares) {
        tokenByShareId = (shares as any[]).reduce((acc, s) => {
          if (s?.id && s?.token) acc[String(s.id)] = String(s.token);
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // 6) Final rows for UI
    const rows =
      (deliveries ?? []).map((r: any) => {
        const sid = r?.share_id ? String(r.share_id) : null;
        const shareToken = sid ? tokenByShareId[sid] : null;

        return {
          id: r.id,
          created_at: r.created_at,
          channel: r.channel,
          to_address: r.to_address,
          status: r.status,
          provider: r.provider,
          provider_message_id: r.provider_message_id,
          error: r.error,
          share_url: shareToken ? `${base}/share/${shareToken}` : null,
        };
      }) ?? [];

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "List deliveries failed" }, { status: 500 });
  }
}