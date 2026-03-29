"use client";

import { useEffect, useState } from "react";
import { getAllOfflineAttachmentRecords } from "@/lib/offlineAttachmentOutbox";

type Props = {
  projectId: string;
  proofId: number;
};

type OfflineAttachmentRecord = {
  id: string;
  projectId: string;
  proofId: number | null;
  offlineProofId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "uploading";
  createdAt: string;
  updatedAt: string;
  uploadAttemptCount: number;
  lastUploadAttemptAt: string | null;
  lastError: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatBytes(bytes: number) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default function AttachmentDiagnosticsPanel({
  projectId,
  proofId,
}: Props) {
  const [records, setRecords] = useState<OfflineAttachmentRecord[]>([]);
  const [errorText, setErrorText] = useState("");

  async function refreshRecords() {
    try {
      setErrorText("");
      const all = await getAllOfflineAttachmentRecords();
      setRecords(
        all.filter((r) => r.projectId === projectId && r.proofId === proofId)
      );
    } catch (e: any) {
      setErrorText(e?.message || "Diagnostics refresh failed");
    }
  }

  useEffect(() => {
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

    function handleAttachmentComplete() {
      refreshRecords();
    }

    refreshRecords();

    const interval = window.setInterval(() => {
      refreshRecords();
    }, 4000);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener(
      "buildproof-attachment-complete",
      handleAttachmentComplete as EventListener
    );
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(
        "buildproof-attachment-complete",
        handleAttachmentComplete as EventListener
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [projectId, proofId]);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        border: "1px dashed rgba(15,23,42,0.18)",
        background: "rgba(15,23,42,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        Attachment Diagnostics
      </div>

      {errorText ? (
        <div className="sub" style={{ color: "#b91c1c", fontWeight: 700 }}>
          {errorText}
        </div>
      ) : null}

      <div className="sub" style={{ fontWeight: 700 }}>
        Queued Uploads: {records.length}
      </div>

      {records.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {records.map((record) => (
            <div
              key={record.id}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "#fff",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <div><strong>File:</strong> {record.fileName}</div>
              <div><strong>Size:</strong> {formatBytes(record.sizeBytes)}</div>
              <div><strong>Status:</strong> {record.status}</div>
              <div><strong>Attempts:</strong> {record.uploadAttemptCount}</div>
              <div><strong>Last Attempt:</strong> {formatDate(record.lastUploadAttemptAt)}</div>
              <div><strong>Last Error:</strong> {record.lastError || "—"}</div>
              <div><strong>Created:</strong> {formatDate(record.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sub" style={{ opacity: 0.75 }}>
          No queued attachment records
        </div>
      )}
    </div>
  );
}