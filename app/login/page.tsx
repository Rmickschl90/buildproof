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
    return redirectedFrom || "/dashboard";
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
      setMessage(`Error: ${err?.message ?? "Code verification failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Login</h1>
          <p className="sub">We'll email you a sign-in code for Leeward.</p>

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
        </div>
      </div>
    </div>
  );
}