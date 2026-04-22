"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  createOfflineAttachmentRecord,
  getAllOfflineAttachmentRecords,
  type OfflineAttachmentRecord,
} from "@/lib/offlineAttachmentOutbox";
import { flushOfflineAttachmentOutbox } from "@/lib/offlineAttachmentFlush";
import AttachmentDiagnosticsPanel from "@/app/components/AttachmentDiagnosticsPanel";

type Props = {
  projectId: string;
  proofId?: number;
  offlineProofId?: string;
  lockedAt?: string | null;
  onUploaded?: () => void;
};

function formatBytes(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function fileKind(mime: string) {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.includes("pdf")) return "pdf";
  return "file";
}

function fileIcon(kind: string) {
  if (kind === "image") return "🖼️";
  if (kind === "pdf") return "📄";
  return "📎";
}

export default function AttachmentUploader({
  projectId,
  proofId,
  offlineProofId,
  lockedAt,
  onUploaded,
}: Props) {
  const [records, setRecords] = useState<OfflineAttachmentRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const isLocked = !!lockedAt;

  async function getAccessToken() {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not logged in");
    return token;
  }

  async function refreshRecords() {
    const all = await getAllOfflineAttachmentRecords();
    setRecords(
      all.filter(
        (r) =>
          r.projectId === projectId &&
          (proofId != null ? r.proofId === proofId : r.offlineProofId === offlineProofId)
      )
    );
  }

  useEffect(() => {
    refreshRecords();

    function handleFocus() {
      refreshRecords();
    }

    function handleOnline() {
      refreshRecords();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshRecords();
      }
    }

    function handleComplete() {
      refreshRecords();
      onUploaded?.();
    }

    const interval = window.setInterval(() => {
      refreshRecords();
    }, 2500);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("buildproof-attachment-complete", handleComplete as EventListener);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(
        "buildproof-attachment-complete",
        handleComplete as EventListener
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [projectId, proofId, offlineProofId, onUploaded]);

  const counts = useMemo(() => {
    const queued = records.filter((q) => q.status === "pending").length;
    const uploading = records.filter((q) => q.status === "uploading").length;
    const error = records.filter((q) => !!q.lastError).length;
    return { queued, uploading, error };
  }, [records]);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (isLocked) return;

    setMessage("");

    try {
      for (const file of Array.from(files)) {
        const maxOfflineBytes = 25 * 1024 * 1024; // generous safety cap (not user-facing)

        if (file.size > maxOfflineBytes) {
          setMessage(`"${file.name}" is unusually large. Try a smaller file if upload fails.`);
          continue;
        }

        await createOfflineAttachmentRecord({
          projectId,
          proofId,
          offlineProofId,
          file,
        });
      }

      await refreshRecords();
      window.dispatchEvent(new CustomEvent("buildproof-data-changed"));

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setMessage("Files saved — will upload automatically when connection returns.");
      } else {
        setBusy(true);
        await flushOfflineAttachmentOutbox(getAccessToken);
        await refreshRecords();
        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
        onUploaded?.();
        setMessage("Uploading automatically…");
      }
    } catch (err: any) {
      setMessage(err?.message || "Failed to queue files");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadAll() {
    if (busy || isLocked) return;

    if (records.length === 0) {
      setMessage("No files selected.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setMessage("Files are queued — waiting for connection.");
        return;
      }

      await flushOfflineAttachmentOutbox(getAccessToken);
      await refreshRecords();
      onUploaded?.();

      const remaining = (await getAllOfflineAttachmentRecords()).filter(
        (r) =>
          r.projectId === projectId &&
          (proofId != null ? r.proofId === proofId : r.offlineProofId === offlineProofId)
      );

      if (remaining.length === 0) {
        setMessage("All files uploaded ✅");
      } else {
        setMessage("Some files are still queued and will retry automatically when connected.");
      }
    } catch (err: any) {
      setMessage(err?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const actionableCount = records.length;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div>
        <div style={{ fontWeight: 800 }}>Add files</div>
        {isLocked ? (
          <div className="sub" style={{ opacity: 0.75, marginTop: 2 }}>
            🔒 Finalized entry — uploads disabled.
          </div>
        ) : (
          <div className="sub" style={{ opacity: 0.75, marginTop: 2 }}>
            Add photos, PDFs, receipts, or documents. Works offline — uploads automatically when connected.
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        onChange={(e) => addFiles(e.target.files)}
        disabled={busy || isLocked}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn"
          onClick={() => inputRef.current?.click()}
          disabled={busy || isLocked}
          title={isLocked ? "Finalized entry — uploads disabled" : "Choose files"}
        >
          Add photos / files
        </button>

        <button
          className="btn btnPrimary"
          onClick={uploadAll}
          disabled={busy || isLocked || actionableCount === 0}
          title="Manually retry uploads"
        >
          {busy ? "Uploading..." : `Retry (${actionableCount})`}
        </button>

        {counts.uploading > 0 ? (
          <div className="sub" style={{ opacity: 0.75 }}>
            Uploading…
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="sub" style={{ opacity: 0.85 }}>
          {message}
        </div>
      ) : null}

      {records.length === 0 ? (
        <div className="sub" style={{ opacity: 0.7 }}>
          No files selected.
        </div>
      ) : null}

      {process.env.NODE_ENV === "development" && proofId != null ? (
        <AttachmentDiagnosticsPanel projectId={projectId} proofId={proofId} />
      ) : null}
    </div>
  );
}