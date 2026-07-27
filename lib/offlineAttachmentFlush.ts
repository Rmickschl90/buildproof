import {
  getPendingOfflineAttachments,
  markAttachmentUploading,
  markAttachmentPending,
  markAttachmentFailed,
  removeOfflineAttachmentRecord,
  type OfflineAttachmentRecord,
} from "@/lib/offlineAttachmentOutbox";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// Same fix pattern as lib/offlineSendFlush.ts's MAX_SEND_ATTEMPTS /
// isLikelyPermanentSendError (2026-07-27) -- an attempt cap as a backstop,
// plus pattern-matching known permanent, retry-proof failures so they don't
// wait out the full cap before the user gets any feedback.
const MAX_ATTACHMENT_ATTEMPTS = 5;

function isLikelyPermanentAttachmentError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("too large") ||
    m.includes("payload too large") ||
    m.includes("(413)") ||
    m.includes("(415)") ||
    m.includes("unsupported") ||
    m.includes("invalid file") ||
    m.includes("not logged in") ||
    m.includes("missing attachment upload body")
  );
}

async function recordAttachmentFailure(record: OfflineAttachmentRecord, message: string) {
  const shouldStop =
    isLikelyPermanentAttachmentError(message) ||
    record.uploadAttemptCount >= MAX_ATTACHMENT_ATTEMPTS;

  if (shouldStop) {
    await markAttachmentFailed(record.id, message);
  } else {
    await markAttachmentPending(record.id, message);
  }
}

let isFlushing = false;

export async function flushOfflineAttachmentOutbox(
  getAccessToken: () => Promise<string>
) {
  if (isFlushing) return;
  if (!isOnline()) return;

  isFlushing = true;

  try {
    const records = await getPendingOfflineAttachments();

    for (const record of records) {
      // Tracks the post-claim record (with its incremented uploadAttemptCount)
      // once markAttachmentUploading() below succeeds, so the retry-cap check
      // in the catch block sees this attempt's real count rather than the
      // stale pre-claim value -- `claimed` itself is try-block-scoped and
      // wouldn't be visible in `catch` otherwise.
      let claimedRecord: OfflineAttachmentRecord | null = null;

      try {
        // 🔒 HARD GUARD — skip if already being processed


        if (!record.proofId) {
          continue;
        }

        const claimed = await markAttachmentUploading(record.id);
        if (!claimed) {
          continue;
        }

        claimedRecord = claimed;

        const token = await getAccessToken();

        // 🔥 STEP 1 — request signed upload URL
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

        const prepText = await prepRes.text();

        let prepJson: any = null;

        try {
          prepJson = prepText ? JSON.parse(prepText) : {};
        } catch {
          throw new Error(
            `Upload prepare returned non-JSON response (${prepRes.status}): ${prepText.slice(
              0,
              160
            )}`
          );
        }

        if (!prepRes.ok) {
          throw new Error(
            prepJson?.error || `Failed to prepare upload (${prepRes.status})`
          );
        }

        const { uploadUrl, path, attachmentId } = prepJson;

        // 🔥 STEP 2 — upload directly to storage (bypasses Vercel limit)
        const uploadBody =
          record.fileBytes
            ? new Blob([record.fileBytes], {
              type: record.mimeType || "application/octet-stream",
            })
            : record.fileBlob;

        if (!uploadBody) {
          throw new Error("Missing attachment upload body");
        }

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: uploadBody,
          headers: {
            "Content-Type": record.mimeType || "application/octet-stream",
          },
        });
        if (!uploadRes.ok) {
          throw new Error(`Direct upload failed (${uploadRes.status})`);
        }

        // 🔥 STEP 3 — insert metadata AFTER successful upload
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
            creatingUserId: record.creatingUserId,
          }),
        });

        const insertJson = await insertRes.json().catch(() => ({}));

        if (!insertRes.ok) {
          throw new Error(insertJson?.error || "Metadata insert failed");
        }

        await removeOfflineAttachmentRecord(record.id);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("buildproof-attachment-complete"));
        }
      } catch (err: any) {
        await recordAttachmentFailure(
          claimedRecord ?? record,
          err?.message || "Upload failed"
        );
      }
    }
  } finally {
    isFlushing = false;
  }
}