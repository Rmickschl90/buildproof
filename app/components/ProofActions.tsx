"use client";

import { useState } from "react";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

export default function ProofActions(props: {
  proofId: number;
  lockedAt: string | null;
  onDone?: () => void; // call to refresh after action
}) {
  const { proofId, lockedAt, onDone } = props;
  const [loading, setLoading] = useState<null | "lock" | "archive" | "delete">(null);
  const isLocked = !!lockedAt;

  async function getAccessToken() {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");
    return token;
  }

  async function lockProof() {
    if (isLocked) return;
    const ok = confirm(
      "Lock this proof?\n\nLocking makes it read-only and strengthens your documentation trail."
    );
    if (!ok) return;

    setLoading("lock");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/proofs/lock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to lock proof");

      onDone?.();
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setLoading(null);
    }
  }

  async function archiveProof() {
    const ok = confirm(
      "Archive this proof?\n\nThis removes it from normal views and exports, but keeps it in the database for audit."
    );
    if (!ok) return;

    setLoading("archive");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/proofs/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to archive proof");

      onDone?.();
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setLoading(null);
    }
  }

  async function deleteProof() {
    const ok = confirm(
      "DELETE this proof permanently?\n\nThis will delete the proof and its attachments. This cannot be undone."
    );
    if (!ok) return;

    setLoading("delete");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/proofs/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete proof");

      onDone?.();
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        onClick={lockProof}
        disabled={loading !== null || isLocked}
        style={{
          border: "1px solid #ccc",
          padding: "6px 10px",
          borderRadius: 8,
          background: isLocked ? "#f4f4f4" : "white",
          cursor: isLocked ? "not-allowed" : "pointer",
        }}
      >
        {isLocked ? "Locked" : loading === "lock" ? "Locking..." : "Lock"}
      </button>

      <button
        onClick={archiveProof}
        disabled={loading !== null}
        style={{
          border: "1px solid #ccc",
          padding: "6px 10px",
          borderRadius: 8,
          background: "white",
          cursor: "pointer",
        }}
      >
        {loading === "archive" ? "Archiving..." : "Archive"}
      </button>

      {!isLocked ? (
  <button
    onClick={deleteProof}
    disabled={loading !== null}
    style={{
      border: "1px solid #f2b8b5",
      padding: "6px 10px",
      borderRadius: 8,
      background: "white",
      cursor: "pointer",
      color: "#b42318",
    }}
  >
    {loading === "delete" ? "Deleting..." : "Delete"}
  </button>
) : null}
    </div>
  );
}
