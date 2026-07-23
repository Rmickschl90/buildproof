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

type Step = "choice" | "individual" | "team";

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
  const [step, setStep] = useState<Step>("choice");
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [startingTeamCheckout, setStartingTeamCheckout] = useState(false);
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

  async function startTeamCheckout() {
    setError("");

    const name = teamName.trim();
    if (!name) {
      setError("Please enter a name for your team.");
      return;
    }

    setStartingTeamCheckout(true);

    try {
      const accessToken = await waitForAccessToken();

      if (!accessToken) {
        throw new Error("Please log in to start checkout.");
      }

      const res = await fetch("/api/billing/team-signup-checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Unable to start checkout.");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed.");
      setStartingTeamCheckout(false);
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

  if (step === "choice") {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Choose your plan</h1>
            <p className="sub">
              Start with a free 14-day trial on either plan. No charge today.
            </p>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <div className="card" style={{ margin: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Individual</h2>
                <p className="sub" style={{ marginTop: 6 }}>
                  Free for 14 days, then $29/month.
                </p>
                <div style={{ marginTop: 14 }}>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => {
                      setError("");
                      setStep("individual");
                    }}
                  >
                    Choose Individual
                  </button>
                </div>
              </div>

              <div className="card" style={{ margin: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Team</h2>
                <p className="sub" style={{ marginTop: 6 }}>
                  Free for 14 days, then $69/month for up to 5 users.
                </p>
                <div style={{ marginTop: 14 }}>
                  <button
                    className="btn btnPrimary"
                    type="button"
                    onClick={() => {
                      setError("");
                      setStep("team");
                    }}
                  >
                    Choose Team
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="sub" style={{ marginTop: 14, color: "#b91c1c" }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "team") {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Name your team</h1>
            <p className="sub">
              Start your free 14-day trial. No charge today. After your trial
              ends, Leeward Team continues for $69/month for up to 5 users.
            </p>

            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              <input
                className="input"
                type="text"
                placeholder="What's your team called?"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                disabled={startingTeamCheckout}
              />
              <button
                className="btn btnPrimary"
                type="button"
                onClick={startTeamCheckout}
                disabled={startingTeamCheckout}
              >
                {startingTeamCheckout ? "Opening checkout..." : "Continue to Payment"}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setError("");
                  setStep("choice");
                }}
                disabled={startingTeamCheckout}
              >
                Back
              </button>
            </div>

            {error && (
              <p className="sub" style={{ marginTop: 14, color: "#b91c1c" }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Start your free 14-day trial</h1>
          <p className="sub">
            No charge today. After your trial ends, Leeward continues for $29/month.
          </p>

          <div style={{ marginTop: 18 }}>
            <button
              className="btn"
              type="button"
              onClick={startCheckout}
              disabled={startingCheckout}
            >
              {startingCheckout ? "Opening checkout..." : "Start Free Trial"}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setError("");
                setStep("choice");
              }}
              disabled={startingCheckout}
            >
              Back
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
