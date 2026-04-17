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

export async function flushOfflineAttachmentOutbox(
  getAccessToken: () => Promise<string>
) {
  if (!isOnline()) return;

  const records = await getPendingOfflineAttachments();

  for (const record of records) {
    try {
      // 🔒 HARD GUARD — skip if already being processed
      

      if (!record.proofId) {
        continue;
      }

      await markAttachmentUploading(record.id);

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

      const prepJson = await prepRes.json();

      if (!prepRes.ok) {
        throw new Error(prepJson?.error || "Failed to prepare upload");
      }

      const { uploadUrl, path, attachmentId } = prepJson;

      // 🔥 STEP 2 — upload directly to storage (bypasses Vercel limit)
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
}