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
  // even with a 4-attempt/400ms polling retry loop in place: that loop's
  // ~1.6s total window still wasn't enough on at least one real production
  // abort -- confirmed via manual /dashboard navigation immediately after,
  // which showed a genuinely signed-in session while the UI was still
  // showing the abort error. Polling getSession() on a fixed schedule is
  // fundamentally guessing at timing. This replaces that guess with an
  // event-driven wait: subscribe to onAuthStateChange (fires the moment
  // supabase-js's internal lock actually finishes writing the session,
  // whenever that happens -- not on our schedule) alongside an immediate
  // check and a final timeout re-check as a safety net, so recovery isn't
  // bounded by an arbitrary small number of fixed-interval polls.
  function waitForRealSession(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(result);
      };

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) finish(true);
      });

      const timer = setTimeout(() => {
        supabase.auth
          .getSession()
          .then(({ data }) => finish(!!data?.session))
          .catch(() => finish(false));
      }, timeoutMs);

      // Also check immediately in case the session already landed in
      // storage before we finished subscribing.
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (data?.session) finish(true);
        })
        .catch(() => {
          // ignore -- the listener and timeout fallback still cover us
        });
    });
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
        // Found 2026-08-04, same session as the handleVerifyCode abort fix:
        // this mount-time getSession() call can hit the exact same
        // supabase-js internal-lock "signal is aborted without reason"
        // abort as verifyOtp() -- confirmed live on production by loading
        // /login with a genuinely valid existing session already in
        // storage and landing on this catch instead of being redirected.
        // Previously this just showed a scary error and stranded an
        // already-signed-in user on the login page. Reuse the same
        // event-driven recovery instead of giving up immediately.
        const recovered = await waitForRealSession(8000);
        if (!cancelled) {
          if (recovered) {
            await establishServerSession();
            router.replace(getRedirectTarget());
            return;
          }
          setMessage(`Error: ${e?.message ?? "Login error"}`);
        }
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

      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: "email",
      });

      if (error) throw error;

      await establishServerSession();
      router.replace(getRedirectTarget());
    } catch (err: any) {
      // Found 2026-08-04, verified by repeating the full send/receive/enter
      // flow three times in a row: supabase-js's internal auth lock can
      // throw a generic "signal is aborted without reason" AbortError from
      // verifyOtp() even when the code was genuinely valid and a real
      // session was established server-side -- the client-side promise
      // just got aborted before it could resolve cleanly, leaving the UI
      // showing a scary/misleading error while the user is actually signed
      // in. Before surfacing an error, check whether we're actually
      // authenticated now; only show the error if we genuinely aren't
      // (e.g. a truly wrong/expired code), so a user doesn't see this and
      // give up right after successfully signing in.
      //
      // Updated 2026-08-04 (same day, re-verification on production): a
      // single immediate getSession() check isn't always enough -- caught a
      // real case where the underlying sign-in had genuinely succeeded
      // (confirmed by manually loading /dashboard right after) but the
      // fallback still showed the error, because getSession() reads from
      // local storage and the aborted lock's session write hadn't landed
      // there yet at the exact moment we checked.
      //
      // Updated again 2026-08-04 (second production re-verification, same
      // day): even a 4-attempt/400ms fixed-interval retry loop wasn't
      // always enough -- reproduced again on production with that loop in
      // place, again confirmed via manual /dashboard navigation that the
      // session was genuinely real. Fixed-interval polling was still just
      // guessing at timing. Replaced with waitForRealSession(), which
      // reacts to the actual onAuthStateChange event the moment
      // supabase-js's internal lock finishes writing the session, with a
      // generous 8s ceiling as a safety net rather than a handful of short
      // polls.
      const recovered = await waitForRealSession(8000);
      if (recovered) {
        await establishServerSession();
        router.replace(getRedirectTarget());
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
            and your back. Start with a free 30-day trial — no charge
            today. After that: $29/month for Individual, or $69/month for
            Team (up to 5 users). Cancel anytime.
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
