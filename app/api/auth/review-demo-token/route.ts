import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// App Review support only. Apple's reviewer signs in with a fixed code
// instead of a real emailed OTP, since the emailed code for our one
// standing demo account (see App Store Connect -> App Review Information)
// goes to the developer's personal inbox, not anywhere the reviewer can
// see it -- a well-known App Review stall/rejection pattern for
// passwordless/2FA sign-in flows.
//
// Narrowly scoped by design: this only ever mints a session for the exact
// email in APP_REVIEW_DEMO_EMAIL, and only when the caller also supplies
// the exact secret in APP_REVIEW_DEMO_CODE. It never sends an email (Admin
// generateLink does not dispatch anything -- that's the whole point of
// using it here) and never touches any other account. If either env var
// is unset, or the email/code don't match, this always returns
// { match: false } and app/login/page.tsx falls straight through to the
// normal supabase.auth.verifyOtp() path unchanged -- every other user and
// every other login attempt on this same account is completely
// unaffected.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();

    const demoEmail = process.env.APP_REVIEW_DEMO_EMAIL?.trim().toLowerCase();
    const demoCode = process.env.APP_REVIEW_DEMO_CODE?.trim();

    if (!demoEmail || !demoCode || !email || !code) {
      return NextResponse.json({ match: false }, { status: 404 });
    }

    if (email !== demoEmail || code !== demoCode) {
      return NextResponse.json({ match: false }, { status: 401 });
    }

    const { data, error } = await supabaseServer.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const otp = (data as any)?.properties?.email_otp;

    if (error || !otp) {
      return NextResponse.json({ match: false }, { status: 500 });
    }

    return NextResponse.json({ match: true, token: otp });
  } catch {
    return NextResponse.json({ match: false }, { status: 400 });
  }
}
