import {
  getPendingOfflineAttachments,
  markAttachmentUploading,
  markAttachmentPending,
  removeOfflineAttachmentRecord,
} from "@/lib/offlineAttachmentOutbox";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

let isFlushing = false;

function logAttachmentDiag(event: string, payload: Record<string, any> = {}) {
  if (typeof window === "undefined") return;

  const key = "buildproof_entry_attachment_diag";
  const existing = JSON.parse(window.localStorage.getItem(key) || "[]");

  existing.push({
    at: new Date().toISOString(),
    event,
    ...payload,
  });

  window.localStorage.setItem(key, JSON.stringify(existing.slice(-200)));
  console.log("🧱 ENTRY_ATTACHMENT_DIAG", event, payload);
}

export async function flushOfflineAttachmentOutbox(
  getAccessToken: () => Promise<string>
) {
  if (isFlushing) {
    logAttachmentDiag("FLUSH_SKIPPED_ALREADY_RUNNING");
    return;
  }

  if (!isOnline()) {
    logAttachmentDiag("FLUSH_SKIPPED_OFFLINE");
    return;
  }

  isFlushing = true;
  logAttachmentDiag("FLUSH_STARTED");

  try {
    const records = await getPendingOfflineAttachments();

    logAttachmentDiag("PENDING_RECORDS_LOADED", {
      count: records.length,
      records: records.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        proofId: r.proofId,
        offlineProofId: r.offlineProofId,
        fileName: r.fileName,
        status: r.status,
        uploadAttemptCount: r.uploadAttemptCount,
        lastError: r.lastError,
      })),
    });

    for (const record of records) {
      try {
        logAttachmentDiag("RECORD_SEEN", {
          id: record.id,
          projectId: record.projectId,
          proofId: record.proofId,
          offlineProofId: record.offlineProofId,
          fileName: record.fileName,
          status: record.status,
          uploadAttemptCount: record.uploadAttemptCount,
          lastError: record.lastError,
        });

        if (!record.proofId) {
          logAttachmentDiag("SKIPPED_NO_PROOF_ID", {
            id: record.id,
            projectId: record.projectId,
            offlineProofId: record.offlineProofId,
            fileName: record.fileName,
            status: record.status,
          });
          continue;
        }

        const claimed = await markAttachmentUploading(record.id);

        if (!claimed) {
          logAttachmentDiag("CLAIM_FAILED", {
            id: record.id,
            proofId: record.proofId,
            fileName: record.fileName,
            status: record.status,
          });
          continue;
        }

        logAttachmentDiag("CLAIMED_UPLOAD_STARTING", {
          id: record.id,
          proofId: claimed.proofId,
          projectId: claimed.projectId,
          fileName: claimed.fileName,
          uploadAttemptCount: claimed.uploadAttemptCount,
        });

        const token = await getAccessToken();

        const prepRes = await fetch("/api/attachments/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: record.projectId,
            proofId: record.proofId,
            fileName: record.fileName,
          }),
        });

        const prepJson = await prepRes.json();

        if (!prepRes.ok) {
          throw new Error(prepJson?.error || "Failed to prepare upload");
        }

        const { uploadUrl, path, attachmentId } = prepJson;

        logAttachmentDiag("SIGNED_UPLOAD_READY", {
          id: record.id,
          proofId: record.proofId,
          attachmentId,
          path,
          fileName: record.fileName,
        });

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: record.fileBlob,
          headers: {
            "Content-Type": record.mimeType || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) {
          throw new Error(`Direct upload failed (${uploadRes.status})`);
        }

        logAttachmentDiag("STORAGE_UPLOAD_SUCCESS", {
          id: record.id,
          proofId: record.proofId,
          attachmentId,
          fileName: record.fileName,
        });

        const insertRes = await fetch("/api/attachments/insert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: attachmentId,
            projectId: record.projectId,
            proofId: record.proofId,
            path,
            fileName: record.fileName,
            mimeType: record.mimeType,
            sizeBytes: record.sizeBytes,
          }),
        });

        const insertJson = await insertRes.json().catch(() => ({}));

        if (!insertRes.ok) {
          throw new Error(insertJson?.error || "Metadata insert failed");
        }

        logAttachmentDiag("METADATA_INSERT_SUCCESS", {
          id: record.id,
          proofId: record.proofId,
          attachmentId,
          fileName: record.fileName,
        });

        await removeOfflineAttachmentRecord(record.id);

        logAttachmentDiag("RECORD_REMOVED_SUCCESS", {
          id: record.id,
          proofId: record.proofId,
          fileName: record.fileName,
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("buildproof-attachment-complete"));
        }
      } catch (err: any) {
        logAttachmentDiag("UPLOAD_FAILED_MARK_PENDING", {
          id: record.id,
          projectId: record.projectId,
          proofId: record.proofId,
          offlineProofId: record.offlineProofId,
          fileName: record.fileName,
          error: err?.message || "Upload failed",
        });

        await markAttachmentPending(record.id, err?.message || "Upload failed");
      }
    }
  } finally {
    logAttachmentDiag("FLUSH_FINISHED");
    isFlushing = false;
  }
}