"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const urlParams = new URLSearchParams(window.location.search);

        const { data: existing } = await supabase.auth.getSession();
        if (!cancelled && existing?.session) {
          await establishServerSession();

          const redirectedFrom = urlParams.get("redirectedFrom");
          router.replace(redirectedFrom || "/dashboard");
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

            const redirectedFrom = urlParams.get("redirectedFrom");
            router.replace(redirectedFrom || "/dashboard");
            return;
          }
        }

        const err = urlParams.get("error");
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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const clean = email.trim();
    if (!clean) return;

    try {
      setBusy(true);

      const base =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL;

      if (!base) throw new Error("Missing app URL");

      const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");
      const emailRedirectTo = redirectedFrom
        ? `${base}/auth/finish?redirectedFrom=${encodeURIComponent(redirectedFrom)}`
        : `${base}/auth/finish`;

      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      setMessage("Check your email for the magic link (click the newest one).");
    } catch (err: any) {
      setMessage(`Error: ${err?.message ?? "Login failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Login</h1>
          <p className="sub">We’ll email you a one-tap sign-in link.</p>

          <form onSubmit={handleLogin} style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
              {busy ? "Sending..." : "Send Magic Link"}
            </button>
          </form>

          {message ? (
            <div className="notice" style={{ marginTop: 12, wordBreak: "break-word" }}>
              {message}
            </div>
          ) : null}

          <div className="sub" style={{ marginTop: 10 }}>
            Tip: always click the newest email link only.
          </div>
        </div>
      </div>
    </div>
  );
}