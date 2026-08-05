"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type InviteInfo = {
  organizationName: string;
  email: string;
  role: string;
  expiresAt: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; invite: InviteInfo };

export default function InvitePage() {
  const params = useParams();
  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
      ? params.token[0]
      : "";
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);

  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [acceptState, setAcceptState] = useState<"idle" | "accepting" | "done" | "error">("idle");
  const [acceptMessage, setAcceptMessage] = useState("");
  const [acceptedOrgName, setAcceptedOrgName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token) {
        setLoadState({ status: "error", message: "Invalid invite link." });
        return;
      }

      try {
        const res = await fetch(`/api/organization/invites/${token}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok) {
          setLoadState({ status: "error", message: data?.error || "This invite could not be loaded." });
          return;
        }

        setLoadState({ status: "ready", invite: data });
      } catch (e: any) {
        if (!cancelled) {
          setLoadState({ status: "error", message: e?.message || "This invite could not be loaded." });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSessionEmail(session?.user?.email ?? null);

      if (event === "SIGNED_IN" && window.location.hash.includes("access_token=")) {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSendCode(inviteEmail: string) {
    setAuthMessage("");

    try {
      setBusy(true);

      const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      if (!base) throw new Error("NEXT_PUBLIC_APP_URL missing in .env.local");

      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail,
        options: { emailRedirectTo: `${base}/invite/${token}` },
      });

      if (error) throw error;

      setCodeSent(true);
      setAuthMessage("Check your email for the Leeward sign-in code.");
    } catch (e: any) {
      setAuthMessage(`Error: ${e?.message ?? "Failed to send code."}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(inviteEmail: string) {
    setAuthMessage("");

    const cleanCode = code.trim();
    if (!cleanCode) return;

    try {
      setBusy(true);

      const { error } = await supabase.auth.verifyOtp({
        email: inviteEmail,
        token: cleanCode,
        type: "email",
      });

      if (error) throw error;
    } catch (e: any) {
      setAuthMessage(`Error: ${e?.message ?? "Code verification failed."}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoutAndContinue() {
    setBusy(true);
    await supabase.auth.signOut();
    setCodeSent(false);
    setCode("");
    setAuthMessage("");
    setBusy(false);
  }

  async function handleAccept() {
    setAcceptState("accepting");
    setAcceptMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setAcceptState("error");
        setAcceptMessage("You're no longer signed in. Please sign in again.");
        setSessionEmail(null);
        return;
      }

      const res = await fetch(`/api/organization/invites/${token}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && data?.error === "You are already a member of this organization.") {
          setAcceptState("done");
          setAcceptedOrgName(loadState.status === "ready" ? loadState.invite.organizationName : "");
          return;
        }

        setAcceptState("error");
        setAcceptMessage(data?.error || "Failed to accept invite.");
        return;
      }

      setAcceptState("done");
      setAcceptedOrgName(data?.organization?.name || "");
    } catch (e: any) {
      setAcceptState("error");
      setAcceptMessage(e?.message || "Failed to accept invite.");
    }
  }

  if (loadState.status === "loading") {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Checking invite...</h1>
            <p className="sub">One moment while we look up this invite.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Invite unavailable</h1>
            <p className="sub">{loadState.message}</p>
            <div style={{ marginTop: 18 }}>
              <button className="btn" type="button" onClick={() => router.replace("/login")}>
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const invite = loadState.invite;

  if (acceptState === "done") {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">You're in!</h1>
            <p className="sub">You're now part of {acceptedOrgName || invite.organizationName}.</p>
            <div style={{ marginTop: 18 }}>
              <button className="btn btnPrimary" type="button" onClick={() => router.replace("/dashboard")}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionEmail === undefined) {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Team Invite</h1>
            <p className="sub">One moment...</p>
          </div>
        </div>
      </div>
    );
  }

  const emailMatches =
    !!sessionEmail && sessionEmail.trim().toLowerCase() === invite.email.trim().toLowerCase();

  if (sessionEmail && !emailMatches) {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Wrong account</h1>
            <p className="sub">
              You're signed in as {sessionEmail}, but this invite was sent to {invite.email}.
            </p>
            <div style={{ marginTop: 18 }}>
              <button className="btn btnPrimary" type="button" disabled={busy} onClick={handleLogoutAndContinue}>
                {busy ? "Logging out..." : "Log Out and Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (emailMatches) {
    return (
      <div className="container">
        <div className="shell">
          <div className="card">
            <h1 className="h1">Join {invite.organizationName}</h1>
            <p className="sub">
              You've been invited to join {invite.organizationName} as a {invite.role}.
            </p>

            {acceptMessage ? (
              <div className="notice" style={{ marginTop: 12, wordBreak: "break-word" }}>
                {acceptMessage}
              </div>
            ) : null}

            <div style={{ marginTop: 18 }}>
              <button
                className="btn btnPrimary"
                type="button"
                disabled={acceptState === "accepting"}
                onClick={handleAccept}
              >
                {acceptState === "accepting" ? "Joining..." : "Accept Invite"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="card">
          <h1 className="h1">Join {invite.organizationName}</h1>
          <p className="sub">Sign in as {invite.email} to accept this invite.</p>

          {!codeSent ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input className="input" type="email" value={invite.email} readOnly disabled />
              <button
                className="btn btnPrimary"
                type="button"
                disabled={busy}
                onClick={() => handleSendCode(invite.email)}
              >
                {busy ? "Sending..." : "Send Sign-In Code"}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <input className="input" type="email" value={invite.email} readOnly disabled />
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className="btn btnPrimary"
                type="button"
                disabled={busy}
                onClick={() => handleVerifyCode(invite.email)}
              >
                {busy ? "Verifying..." : "Verify Code"}
              </button>
              {/* 2026-08-06, per Ryan: found on Android/Outlook (didn't
                  reproduce on Gmail, so this is isolated to certain mail
                  apps' in-app browsers) -- leaving this screen to go read
                  the code, then coming back, reloads the page and resets
                  it back to "Send Sign-In Code" instead of showing the
                  code box again. The email's own sign-in link isn't
                  affected by that reset (it's a fresh, self-contained
                  action from the mail app), so it's the more reliable path
                  on those browsers -- this note exists so people don't
                  have to spot it themselves the way Ryan did. Static text,
                  not tied to authMessage, so it can't get overwritten by a
                  later error message and disappear right when it's needed
                  most. */}
              <p className="sub" style={{ fontSize: 13 }}>
                You can enter the code above, or just tap the sign-in link
                in that same email instead — no need to come back here to
                type it. Don't see the email within a minute or two? Check
                your spam or junk folder; it can land there depending on
                your email app.
              </p>
            </div>
          )}

          {authMessage ? (
            <div className="notice" style={{ marginTop: 12, wordBreak: "break-word" }}>
              {authMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
