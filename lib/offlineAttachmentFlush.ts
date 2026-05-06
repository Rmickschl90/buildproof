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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }

    throw err;
  } finally {
    window.clearTimeout(timeout);
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
      try {
        // 🔒 HARD GUARD — skip if already being processed


        if (!record.proofId) {
          continue;
        }

        const claimed = await markAttachmentUploading(record.id);
        if (!claimed) {
          continue;
        }

        const token = await getAccessToken();

        // 🔥 STEP 1 — request signed upload URL
        const prepRes = await fetchWithTimeout("/api/attachments/upload", {
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
        }, 30000, "Upload prepare");

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
        const uploadRes = await fetchWithTimeout(uploadUrl, {
          method: "PUT",
          body: record.fileBlob,
          headers: {
            "Content-Type": record.mimeType || "application/octet-stream",
          },
        }, 45000, "Direct attachment upload");

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
        await markAttachmentPending(record.id, err?.message || "Upload failed");
      }
    }
  } finally {
    isFlushing = false;
  }
}