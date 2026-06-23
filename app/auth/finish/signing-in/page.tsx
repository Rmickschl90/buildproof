"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

async function waitForAccessToken(timeoutMs = 6000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data } = await supabase.auth.getSession();

    if (data.session?.access_token) {
      return data.session.access_token;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

export default function SigningIn() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");

      const accessToken = await waitForAccessToken();

      if (cancelled) return;

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      try {
        const res = await fetch("/api/billing/status", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (cancelled) return;

        if (!res.ok) {
          router.replace("/subscribe");
          return;
        }

        const billing = await res.json();

        if (billing?.status === "active" || billing?.status === "trialing") {
          router.replace(redirectedFrom || "/dashboard");
          return;
        }

        router.replace("/subscribe");
      } catch {
        if (!cancelled) {
          router.replace("/subscribe");
        }
      }
    }

    finishSignIn();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Signing you in...</h1>
          <p className="sub">One moment while we finish setting up your session.</p>
        </div>
      </div>
    </div>
  );
}
