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

export async function flushOfflineAttachmentOutbox(
  getAccessToken: () => Promise<string>
) {
  if (isFlushing) return;
  if (!isOnline()) return;

  isFlushing = true;

  try {
    const records = await getPendingOfflineAttachments();

    for (const record of records) {
      try {
        if (!record.proofId) {
          continue;
        }

        const claimed = await markAttachmentUploading(record.id);
        if (!claimed) {
          continue;
        }

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

        const prepText = await prepRes.text();

        let prepJson: any = null;

        try {
          prepJson = prepText ? JSON.parse(prepText) : {};
        } catch {
          throw new Error(
            `Entry upload prepare returned non-JSON response (${prepRes.status}): ${prepText.slice(
              0,
              160
            )}`
          );
        }

        if (!prepRes.ok) {
          throw new Error(
            `Entry upload prepare failed: ${prepJson?.error || `HTTP ${prepRes.status}`
            }`
          );
        }

        const { uploadUrl, path, attachmentId } = prepJson;

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: record.fileBlob,
          headers: {
            "Content-Type": record.mimeType || "application/octet-stream",
          },
        });

        if (!uploadRes.ok) {
          throw new Error(
            `Entry direct storage upload failed: HTTP ${uploadRes.status}`
          );
        }

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
          throw new Error(
            `Entry metadata insert failed: ${insertJson?.error || "Unknown insert failure"
            }`
          );
        }

        console.log(
          "[offlineAttachmentFlush] removing attachment record after successful insert",
          {
            recordId: record.id,
            proofId: record.proofId,
            fileName: record.fileName,
          }
        );

        await removeOfflineAttachmentRecord(record.id);

        console.log(
          "[offlineAttachmentFlush] attachment record removed",
          {
            recordId: record.id,
          }
        );

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("buildproof-attachment-complete"));
        }
      } catch (err: any) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown upload failure";

        await markAttachmentPending(record.id, message);
      }
    }
  } finally {
    isFlushing = false;
  }
}