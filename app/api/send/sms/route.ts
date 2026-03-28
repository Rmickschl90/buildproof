import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

const twilioSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioFrom = process.env.TWILIO_FROM_NUMBER || "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

function makeToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function looksLikeE164(phone: string) {
  return /^\+\d{10,15}$/.test(phone);
}

export async function POST(req: Request) {
  let deliveryId: string | null = null;

  try {
    // ✅ AUTH PROTECTION — verifies logged-in user
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    // ENV checks early (clean errors)
    if (!twilioSid) return NextResponse.json({ error: "Missing TWILIO_ACCOUNT_SID" }, { status: 500 });
    if (!twilioToken) return NextResponse.json({ error: "Missing TWILIO_AUTH_TOKEN" }, { status: 500 });
    if (!twilioFrom) return NextResponse.json({ error: "Missing TWILIO_FROM_NUMBER" }, { status: 500 });
    if (!appUrl) return NextResponse.json({ error: "Missing NEXT_PUBLIC_APP_URL" }, { status: 500 });

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "");
    const toPhone = String(body?.toPhone || "").trim();
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    if (!toPhone) return NextResponse.json({ error: "Missing toPhone" }, { status: 400 });
    if (!looksLikeE164(toPhone)) {
      return NextResponse.json({ error: "Phone must be in E.164 format (example: +15551234567)" }, { status: 400 });
    }

    // --- Ownership check ---
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,user_id,title")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // --- Create share token ---
    const shareToken = makeToken();

    const { data: shareRow, error: insertErr } = await supabaseServer
      .from("project_shares")
      .insert({
        project_id: projectId,
        created_by: userId,
        token: shareToken,
      })
      .select("id, token")
      .single();

    if (insertErr || !shareRow) {
      return NextResponse.json({ error: insertErr?.message || "Share insert failed" }, { status: 400 });
    }

    const shareUrl = `${appUrl.replace(/\/+$/, "")}/share/${shareToken}`;

    // SMS should be short + always include link
    const defaultMsg = `BuildProof update: ${project.title || "Project"}\n${shareUrl}`;
    const finalMsg = (message ? `${message}\n${shareUrl}` : defaultMsg).trim();

    // --- Log delivery FIRST (so history works even if Twilio fails) ---
    const { data: deliveryRow, error: deliveryErr } = await supabaseServer
      .from("message_deliveries")
      .insert({
        user_id: userId,
        project_id: projectId,
        share_id: shareRow.id,
        channel: "sms",
        to_address: toPhone,
        message_body: finalMsg || "SMS sent", // ✅ NOT NULL-safe
        provider: "twilio",
        provider_message_id: null,
        status: "sending",
        error: null,
      })
      .select("id")
      .single();

    if (deliveryErr) {
      return NextResponse.json(
        { error: "Failed to log message_deliveries row", details: deliveryErr.message },
        { status: 500 }
      );
    }

    deliveryId = deliveryRow?.id ?? null;

    // --- Send via Twilio ---
    const client = twilio(twilioSid, twilioToken);
    const msg = await client.messages.create({
      from: twilioFrom,
      to: toPhone,
      body: finalMsg,
    });

    // --- Update delivery -> sent ---
    if (deliveryId) {
      await supabaseServer
        .from("message_deliveries")
        .update({
          status: "sent",
          provider_message_id: msg.sid,
          error: null,
        })
        .eq("id", deliveryId);
    }

    return NextResponse.json({
      ok: true,
      shareUrl,
      sid: msg.sid,
      deliveryId,
    });
  } catch (e: any) {
    // Update delivery -> failed
    if (deliveryId) {
      await supabaseServer
        .from("message_deliveries")
        .update({
          status: "failed",
          error: e?.message ?? "Send sms failed",
        })
        .eq("id", deliveryId);
    }

    return NextResponse.json({ error: e?.message ?? "Send sms failed" }, { status: 500 });
  }
}