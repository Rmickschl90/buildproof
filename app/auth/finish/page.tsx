"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthFinish() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const code = new URLSearchParams(window.location.search).get("code");

        if (!code) {
          router.replace("/login?error=missing_code");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (cancelled) return;

        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }

        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          router.replace("/login?error=missing_session_after_exchange");
          return;
        }

        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          router.replace(`/login?error=${encodeURIComponent("failed_to_set_server_cookie")}`);
          return;
        }

        setMsg("Signed in! Redirecting…");
        router.replace("/auth/signing-in");
      } catch (e: any) {
        if (!cancelled) {
          router.replace(`/login?error=${encodeURIComponent(e?.message ?? "auth_finish_failed")}`);
        }
      }
    }

    finish();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">{msg}</h1>
          <p className="sub">One moment…</p>
        </div>
      </div>
    </div>
  );
}