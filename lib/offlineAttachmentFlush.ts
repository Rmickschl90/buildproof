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
      if (!record.proofId) {
        // waiting for proof to sync first
        continue;
      }

      await markAttachmentUploading(record.id);

      const token = await getAccessToken();

      const form = new FormData();
      form.append("projectId", record.projectId);
      form.append("proofId", String(record.proofId));
      form.append(
        "file",
        new File([record.fileBlob], record.fileName, {
          type: record.mimeType,
        })
      );

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Upload failed");
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