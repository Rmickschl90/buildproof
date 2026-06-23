"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BillingStatus = {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
};

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

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkBilling() {
      try {
        const accessToken = await waitForAccessToken();

        if (cancelled) return;

        if (!accessToken) {
          setLoading(false);
          setError("Please log in to start your subscription.");
          return;
        }

        const res = await fetch("/api/billing/status", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (cancelled) return;

        if (!res.ok) {
          setLoading(false);
          setError("Please log in to start your subscription.");
          return;
        }

        const data = (await res.json()) as BillingStatus;

        if (data.status === "active" || data.status === "trialing") {
          router.replace("/dashboard");
          return;
        }

        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Unable to check billing status.");
          setLoading(false);
        }
      }
    }

    checkBilling();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function startCheckout() {
    setError("");
    setStartingCheckout(true);

    try {
      const accessToken = await waitForAccessToken();

      if (!accessToken) {
        throw new Error("Please log in to start checkout.");
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Unable to start checkout.");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed.");
      setStartingCheckout(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Checking subscription...</h1>
            <p className="sub">One moment while we verify your access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Start using Leeward</h1>
          <p className="sub">
            Leeward requires an active subscription to access the dashboard.
          </p>

          <div style={{ marginTop: 18 }}>
            <button
              className="btn"
              type="button"
              onClick={startCheckout}
              disabled={startingCheckout}
            >
              {startingCheckout ? "Opening checkout..." : "Subscribe"}
            </button>
          </div>

          {error && (
            <>
              <p className="sub" style={{ marginTop: 14, color: "#b91c1c" }}>
                {error}
              </p>
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => router.replace("/login")}
                >
                  Go to Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
