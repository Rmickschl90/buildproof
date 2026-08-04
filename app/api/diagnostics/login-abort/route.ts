import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Diagnostics-only endpoint, added 2026-08-04 alongside the /login hard-
// navigation fix for the supabase-js internal-lock abort race (see
// app/login/page.tsx's isAbortRace/hardNavigateToSigningIn comments for
// full root-cause history). This does NOT participate in the login flow
// in any way -- it exists purely so we have real production data on how
// often the abort race actually fires for real users, since ad traffic
// is about to start and the fix has only been manually verified a
// handful of times on desktop. Every request just gets logged to Vercel's
// function logs (visible via `vercel logs` or the dashboard); nothing is
// stored, nothing blocks, nothing can throw back into the caller.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log(
      "[login-abort-race]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        location: typeof body?.location === "string" ? body.location : null,
        message: typeof body?.message === "string" ? body.message : null,
        redirectedFrom:
          typeof body?.redirectedFrom === "string" ? body.redirectedFrom : null,
        userAgent: req.headers.get("user-agent") ?? null,
      })
    );
  } catch {
    // Best-effort diagnostics only -- never let this fail loudly.
  }

  return NextResponse.json({ ok: true });
}
