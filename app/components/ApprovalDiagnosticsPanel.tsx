"use client";

import { useEffect, useState } from "react";
import { getOfflineApprovalAttachmentsForApproval } from "@/lib/offlineApprovalAttachmentOutbox";
import { hasPendingOfflineApprovalSend } from "@/lib/offlineApprovalSendOutbox";

type Props = {
  approvalId: string;
};

type ApprovalAttachmentDebugRecord = {
  id: string;
  approvalId?: string | null;
  offlineApprovalId?: string | null;
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

export default function ApprovalDiagnosticsPanel({ approvalId }: Props) {
  const [records, setRecords] = useState<ApprovalAttachmentDebugRecord[]>([]);
  const [sendQueued, setSendQueued] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function refreshRecords() {
    try {
      setErrorText("");

      const isOfflineApproval = approvalId.startsWith("offline-");

      const attachmentRecords = await getOfflineApprovalAttachmentsForApproval({
        approvalId: isOfflineApproval ? null : approvalId,
        offlineApprovalId: isOfflineApproval ? approvalId : null,
      });

      const queued = await hasPendingOfflineApprovalSend({
        approvalId: isOfflineApproval ? null : approvalId,
        offlineApprovalId: isOfflineApproval ? approvalId : null,
      });

      setRecords(attachmentRecords as ApprovalAttachmentDebugRecord[]);
      setSendQueued(queued);
    } catch (e: any) {
      setErrorText(e?.message || "Approval diagnostics refresh failed");
    }
  }

  useEffect(() => {
    refreshRecords();

    const interval = window.setInterval(() => {
      refreshRecords();
    }, 4000);

    function handleDataChanged() {
      refreshRecords();
    }

    function handleFocus() {
      refreshRecords();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshRecords();
      }
    }

    window.addEventListener("buildproof-data-changed", handleDataChanged);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("buildproof-data-changed", handleDataChanged);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [approvalId]);

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
        Approval Diagnostics
      </div>

      {errorText ? (
        <div className="sub" style={{ color: "#b91c1c", fontWeight: 700 }}>
          {errorText}
        </div>
      ) : null}

      <div className="sub" style={{ fontWeight: 700 }}>
        Approval send queued: {sendQueued ? "yes" : "no"}
      </div>

      <div className="sub" style={{ fontWeight: 700 }}>
        Queued approval uploads: {records.length}
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
              <div><strong>Approval ID:</strong> {record.approvalId || "—"}</div>
              <div><strong>Offline Approval ID:</strong> {record.offlineApprovalId || "—"}</div>
              <div><strong>Created:</strong> {formatDate(record.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sub" style={{ opacity: 0.75 }}>
          No queued approval attachment records.
        </div>
      )}
    </div>
  );
}