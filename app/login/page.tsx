"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function establishServerSession() {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;

    await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  function getRedirectTarget() {
    const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
    return redirectedFrom || "/auth/finish/signing-in";
  }

  // Found 2026-08-04, reproduced a second time on production the same day
  // even with a 4-attempt/400ms polling retry loop in place, and then a
  // THIRD time with an event-driven onAuthStateChange-based wait in place
  // too -- both still showed the error while a real session genuinely
  // existed (confirmed each time via manual /dashboard navigation in the
  // same tab, which worked instantly). The common thread: every one of
  // those fixes tried to keep using supabase-js's client instance on the
  // ALREADY-LOADED /login page. The working signal every time was a fresh
  // full navigation. Root cause theory: supabase-js's internal
  // navigator.locks-based auth mutex gets wedged after the abort -- the
  // lock from the original aborted call is never cleanly released, so
  // every subsequent call on this same page (polling OR event listeners)
  // that needs that same lock hangs or fails too, even though the real
  // session is sitting in storage the whole time. A page reload gets a
  // brand-new lock manager scope and a brand-new supabase-js client, which
  // reads storage cleanly.
  //
  // Fix: on this specific abort, stop trying to recover in-page. Hard-
  // navigate to /auth/finish/signing-in instead, which already has its own
  // battle-tested access-token polling loop (waitForAccessToken(), up to
  // 6s) running against a FRESH client on a freshly-loaded page -- and
  // falls back to /login on its own if there's genuinely no session. Only
  // takes this path for the specific abort signature, so a real wrong/
  // expired code still shows an immediate, specific error instead of a
  // silent multi-second redirect.
  function isAbortRace(message: string | undefined) {
    return !!message && /abort/i.test(message);
  }

  // Diagnostics only, added 2026-08-04 alongside this fix, ahead of ad
  // traffic starting: fire-and-forget, best-effort ping so we have real
  // production data on how often this abort race actually fires, since so
  // far it's only been observed a handful of times manually. Deliberately
  // does NOT await, and is wrapped so it can never throw -- must never
  // slow down or interfere with the hard navigation this runs alongside.
  // See app/api/diagnostics/login-abort/route.ts.
  function reportAbortRace(location: "mount" | "verify", message: string | undefined) {
    try {
      const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
      fetch("/api/diagnostics/login-abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, message, redirectedFrom }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Never let diagnostics reporting affect the actual recovery path.
    }
  }

  function hardNavigateToSigningIn() {
    const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
    window.location.href = redirectedFrom
      ? `/auth/finish/signing-in?redirectedFrom=${encodeURIComponent(redirectedFrom)}`
      : "/auth/finish/signing-in";
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (!cancelled && existing?.session) {
          await establishServerSession();
          router.replace(getRedirectTarget());
          return;
        }

        const hash = window.location.hash;
        if (hash && hash.includes("access_token=") && hash.includes("refresh_token=")) {
          const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });

            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

            if (error) {
              setMessage(`Error: ${error.message}`);
              return;
            }

            await establishServerSession();
            router.replace(getRedirectTarget());
            return;
          }
        }

        const err = new URLSearchParams(window.location.search).get("error");
        if (err && !cancelled) setMessage(`Error: ${err}`);
      } catch (e: any) {
        // Found 2026-08-04, same underlying bug as the handleVerifyCode
        // abort race: this mount-time getSession() call can hit the exact
        // same supabase-js internal-lock abort -- confirmed live on
        // production by loading /login with a genuinely valid existing
        // session already in storage and landing on this catch instead of
        // being redirected. Previously this just showed a scary error and
        // stranded an already-signed-in user. See hardNavigateToSigningIn's
        // comment above for the full root-cause writeup and why an in-page
        // retry can't fix this -- only a fresh page load can.
        if (!cancelled && isAbortRace(e?.message)) {
          reportAbortRace("mount", e?.message);
          hardNavigateToSigningIn();
          return;
        }
        if (!cancelled) setMessage(`Error: ${e?.message ?? "Login error"}`);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMessage("");

    const clean = email.trim().toLowerCase();
    if (!clean) return;

    try {
      setBusy(true);

      const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      if (!base) throw new Error("NEXT_PUBLIC_APP_URL missing in .env.local");

      const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
      const emailRedirectTo = redirectedFrom
        ? `${base}/auth/finish?redirectedFrom=${encodeURIComponent(redirectedFrom)}`
        : `${base}/auth/finish`;

      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      setEmail(clean);
      setCodeSent(true);
      setMessage("Check your email for the Leeward sign-in code.");
    } catch (err: any) {
      setMessage(`Error: ${err?.message ?? "Login failed"}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!cleanEmail || !cleanCode) return;

    try {
      setBusy(true);

      let verifyToken = cleanCode;

      // App Review support only, added 2026-08-04: Apple's reviewer can't
      // receive a real emailed code for our demo account (it goes to the
      // developer's personal inbox), a common App Review stall for
      // passwordless sign-in. Every verify attempt asks the server whether
      // this email/code pair matches the one designated demo account + fixed
      // reviewer code -- if it does, the server mints a real, valid one-time
      // code via Supabase's admin API (no email sent) and we verify with
      // that instead. Any non-match (wrong email, wrong code, feature not
      // configured, server error, etc.) silently falls through and verifies
      // cleanEmail/cleanCode exactly as before, so a real emailed code -- or
      // a genuinely wrong one -- still behaves exactly as it always has for
      // every account other than the one designated demo address.
      //
      // Deliberately NOT gated on a client-side/NEXT_PUBLIC_ env var check
      // first (an earlier version of this fix was, and that var never got
      // inlined into the production client bundle for reasons never fully
      // root-caused -- see REGRESSION_LEDGER.md). Calling this endpoint
      // unconditionally on every verify attempt removes that entire failure
      // mode and also avoids ever shipping the demo email address into the
      // client bundle. The extra round-trip is one fast serverless call and
      // is invisible to real users, who always get match:false back.
      try {
        const res = await fetch("/api/auth/review-demo-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.match && data?.token) {
            verifyToken = data.token;
          }
        }
      } catch {
        // Falls through to the real code below -- never blocks sign-in.
      }

      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: verifyToken,
        type: "email",
      });

      if (error) throw error;

      await establishServerSession();
      router.replace(getRedirectTarget());
    } catch (err: any) {
      // Found 2026-08-04, verified by repeating the full send/receive/enter
      // flow three times in a row, then reproduced twice more the same day
      // against two different in-page recovery attempts (a fixed-interval
      // retry loop, then an onAuthStateChange-based event-driven wait) --
      // both still showed this error while a real session genuinely
      // existed server-side, confirmed each time via manual /dashboard
      // navigation in the same tab succeeding instantly. See
      // hardNavigateToSigningIn's comment above for the full root-cause
      // writeup: supabase-js's internal auth lock appears to get wedged on
      // this page after the abort, so no in-page client-side check can
      // ever reliably recover -- only a fresh page load can. Hard-navigate
      // to /auth/finish/signing-in, which polls for the access token on a
      // brand-new client and falls back to /login itself if there's
      // genuinely no session, rather than trying (and repeatedly failing)
      // to recover in-page. Scoped to this specific abort signature so a
      // real wrong/expired code still shows an immediate, specific error.
      if (isAbortRace(err?.message)) {
        reportAbortRace("verify", err?.message);
        hardNavigateToSigningIn();
        return;
      }

      setMessage(`Error: ${err?.message ?? "Code verification failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          {/* Fixes a real conversion gap found 2026-08-04: visitors coming
              from the marketing site's "Get Started" CTA landed on a bare
              page titled "Login" with no logo, no confirmation this was
              still Leeward, and no restatement of the 30-day trial they'd
              just been promised seconds earlier -- a plausible silent
              killer for ad-driven traffic (0 of ~120 site visits converted
              to a signup). Logo + welcoming headline + trial/price recap
              added below; the email-code mechanism itself is unchanged.
              Copy is intentionally generic enough to work for both a
              brand-new visitor and a returning customer signing back in,
              since this route serves both. Pricing here ($29/mo Individual,
              $69/mo Team) mirrors app/subscribe/page.tsx -- keep both in
              sync if prices ever change. */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: "3px 6px",
              display: "inline-flex",
              alignItems: "center",
              lineHeight: 0,
              marginBottom: 16,
            }}
          >
            <img
              src="/Leeward-Logo-Approved-Concept.png"
              alt="Leeward"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </div>

          <h1 className="h1">Welcome to Leeward</h1>
          <p className="sub">
            Sign in or create your account below — we'll email you a
            one-time code, no password needed.
          </p>

          <div
            className="sub"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(var(--accent-rgb),0.08)",
              border: "1px solid rgba(var(--accent-rgb),0.18)",
              fontSize: 13,
            }}
          >
            New here? Enjoy peace of mind knowing we've got the paper trail
            and your back. Start with a free 30-day trial — no card
            required today. After 30 days, add a payment method to keep
            your access: $29/month for Individual, or $69/month for Team
            (up to 5 users). Cancel anytime.
          </div>

          {!codeSent ? (
            <form onSubmit={handleSendCode} style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input
                className="input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <button className="btn btnPrimary" type="submit" disabled={busy}>
                {busy ? "Sending..." : "Send Sign-In Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />

              <button className="btn btnPrimary" type="submit" disabled={busy}>
                {busy ? "Verifying..." : "Verify Code"}
              </button>

              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCode("");
                  setCodeSent(false);
                  setMessage("");
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          {message ? (
            <div className="notice" style={{ marginTop: 12, wordBreak: "break-word" }}>
              {message}
            </div>
          ) : null}

          <div className="sub" style={{ marginTop: 10 }}>
            Tip: enter the newest code from your email.
          </div>

          <div style={{ marginTop: 14 }}>
            <a href="https://getleeward.com" className="sub" style={{ textDecoration: "underline" }}>
              &larr; Back to getleeward.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
