import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasKey: !!process.env.RESEND_API_KEY,
    hasFrom: !!(process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL),
    from: process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || null,
    ts: new Date().toISOString(),
  });
}