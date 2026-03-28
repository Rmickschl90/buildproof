"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SigningIn() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function go() {
      await new Promise((r) => setTimeout(r, 250));

      const { data } = await supabase.auth.getSession();

      if (cancelled) return;

      const redirectedFrom = new URLSearchParams(window.location.search).get("redirectedFrom");

      if (data?.session) {
        router.replace(redirectedFrom || "/dashboard");
      } else {
        router.replace("/login");
      }
    }

    go();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Signing you in…</h1>
          <p className="sub">One moment while we finish setting up your session.</p>
        </div>
      </div>
    </div>
  );
}