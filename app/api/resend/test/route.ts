import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || "";

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    if (!RESEND_API_KEY) return NextResponse.json({ ok: false, error: "Missing RESEND_API_KEY" }, { status: 500 });
    if (!RESEND_FROM) return NextResponse.json({ ok: false, error: "Missing RESEND_FROM" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const toEmail = String(body?.toEmail || "").trim();
    if (!toEmail) return NextResponse.json({ ok: false, error: "Missing toEmail" }, { status: 400 });

    const payload = {
      from: RESEND_FROM,
      to: [toEmail],
      subject: "BuildProof test email",
      text: "This is a test email from BuildProof (no PDF, no DB).",
    };

    const res = await fetchWithTimeout(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      12_000
    );

    const json = await readJsonSafe(res);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Resend failed", status: res.status, details: json?.message || json?.error || json?.raw || json },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: json?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Test failed" }, { status: 500 });
  }
}