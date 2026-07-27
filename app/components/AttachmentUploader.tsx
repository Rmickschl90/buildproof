"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  createOfflineAttachmentRecord,
  getAllOfflineAttachmentRecords,
  markAttachmentPending,
  removeOfflineAttachmentRecord,
  type OfflineAttachmentRecord,
} from "@/lib/offlineAttachmentOutbox";
import { normalizeImageFileForUpload } from "@/lib/normalizeImageFile";
import { flushOfflineAttachmentOutbox } from "@/lib/offlineAttachmentFlush";

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
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
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

  // Stuck-attachment fix (2026-07-27): "failed" is now a genuine terminal
  // state (see lib/offlineAttachmentOutbox.ts) -- a permanently-failing
  // upload used to just reset to "pending" forever with no cap, which also
  // silently blocked this project's send banner ("Waiting for attachments to
  // finish uploading...") from ever clearing. flushOfflineAttachmentOutbox()
  // deliberately never auto-retries "failed" records, so they need an
  // explicit manual action here or they'd just sit there with no feedback.
  const failedRecords = useMemo(
    () => records.filter((r) => r.status === "failed"),
    [records]
  );

  // Visibility fix (2026-07-27, per Ryan): a queued/uploading record used to
  // be completely invisible -- it only bumped the generic "Retry (N)" count
  // below, with no filename, no status, no explanation. That made a stuck
  // upload nearly impossible to notice or make sense of (found via a real
  // stuck-attachment report on staging). These render the same info the
  // failedRecords cards do, just without the error framing/Dismiss action --
  // Retry(N) already covers manually re-driving these.
  const queuedRecords = useMemo(
    () => records.filter((r) => r.status !== "failed"),
    [records]
  );

  function formatQueuedSince(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "recently";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function queuedReason(record: OfflineAttachmentRecord) {
    if (record.status === "uploading") return "Uploading now…";

    if (record.uploadAttemptCount > 0) {
      return `Attempt ${record.uploadAttemptCount} of 5 — will retry automatically.`;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return "Waiting for a connection to upload.";
    }

    return "Waiting to upload…";
  }

  const [retryingFailedId, setRetryingFailedId] = useState<string | null>(null);

  async function retryFailedRecord(id: string) {
    setRetryingFailedId(id);

    try {
      await markAttachmentPending(id, null);
      await refreshRecords();

      if (typeof navigator !== "undefined" && navigator.onLine) {
        await flushOfflineAttachmentOutbox(getAccessToken);
        await refreshRecords();
        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
        onUploaded?.();
      }
    } catch {
      // refreshRecords() below will surface the current real state either way
    } finally {
      setRetryingFailedId(null);
      await refreshRecords();
    }
  }

  async function dismissFailedRecord(id: string) {
    await removeOfflineAttachmentRecord(id);
    await refreshRecords();
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (isLocked) return;

    setMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const creatingUserId = sessionData.session?.user?.id;

      for (const rawFile of Array.from(files)) {
        const rawFileType = (rawFile.type || "").toLowerCase();
        const rawFileName = (rawFile.name || "").toLowerCase();

        const looksLikeVideo =
          rawFileType.startsWith("video/") ||
          rawFileName.endsWith(".mov") ||
          rawFileName.endsWith(".mp4") ||
          rawFileName.endsWith(".m4v") ||
          rawFileName.endsWith(".avi") ||
          rawFileName.endsWith(".webm");

        if (looksLikeVideo) {
          setMessage("Video uploads are not supported in the current V1 field test. Please use photos, PDFs, or documents for now.");
          continue;
        }
        const file = await normalizeImageFileForUpload(rawFile);

        const maxOfflineBytes = 25 * 1024 * 1024;

        if (file.size > maxOfflineBytes) {
          setMessage(`"${file.name}" is unusually large. Try a smaller file if upload fails.`);
          continue;
        }

        await createOfflineAttachmentRecord({
          projectId,
          proofId,
          offlineProofId,
          file,
          creatingUserId,
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

  // Excludes "failed" records -- the generic Retry button below only drives
  // flushOfflineAttachmentOutbox(), which deliberately skips terminal
  // "failed" records now. Those get their own per-record Retry/Dismiss in
  // the failedRecords section instead.
  const actionableCount = records.filter((r) => r.status !== "failed").length;

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

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => addFiles(e.target.files)}
        disabled={busy || isLocked}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className="btn"
          onClick={() => cameraInputRef.current?.click()}
          disabled={busy || isLocked}
          title={isLocked ? "Finalized entry - uploads disabled" : "Take photo"}
        >
          Take photo
        </button>

        <button
          className="btn"
          onClick={() => inputRef.current?.click()}
          disabled={busy || isLocked}
          title={isLocked ? "Finalized entry - uploads disabled" : "Choose files"}
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

      {queuedRecords.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          {queuedRecords.map((r) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gap: 2,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surfaceSoft)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true">{fileIcon(fileKind(r.mimeType))}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{r.fileName}</span>
              </div>
              <div className="sub" style={{ fontSize: 12 }}>
                Queued since {formatQueuedSince(r.createdAt)} · {queuedReason(r)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {failedRecords.length > 0 ? (
        <div
          style={{
            display: "grid",
            gap: 6,
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(var(--danger-rgb),0.28)",
            background: "rgba(var(--danger-rgb),0.06)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            ⚠ {failedRecords.length} file{failedRecords.length === 1 ? "" : "s"} couldn't be uploaded
          </div>

          {failedRecords.map((r) => (
            <div key={r.id} style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span className="sub" style={{ fontSize: 12 }}>
                  {r.fileName}: {r.lastError || "Upload failed"}
                </span>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn"
                    onClick={() => retryFailedRecord(r.id)}
                    disabled={retryingFailedId === r.id || isLocked}
                    style={{ height: 28, fontSize: 12, padding: "0 10px" }}
                  >
                    {retryingFailedId === r.id ? "Retrying..." : "Retry"}
                  </button>

                  <button
                    className="btn"
                    onClick={() => dismissFailedRecord(r.id)}
                    style={{ height: 28, fontSize: 12, padding: "0 10px" }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
