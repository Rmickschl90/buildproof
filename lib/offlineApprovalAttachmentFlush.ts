import {
    getPendingOfflineApprovalAttachments,
    markOfflineApprovalAttachmentUploading,
    markOfflineApprovalAttachmentPending,
    removeOfflineApprovalAttachmentRecord,
} from "@/lib/offlineApprovalAttachmentOutbox";

function isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
}

let isFlushing = false;

export async function flushOfflineApprovalAttachmentOutbox(
    getAccessToken: () => Promise<string>
) {
    if (isFlushing) return;
    if (!isOnline()) return;

    isFlushing = true;

    try {
        const records = await getPendingOfflineApprovalAttachments();
        const completedApprovalIds = new Set<string>();

        for (const record of records) {
            try {
                if (!record.approvalId) {
                    continue;
                }

                const claimed = await markOfflineApprovalAttachmentUploading(record.id);
                if (!claimed) {
                    continue;
                }

                const token = await getAccessToken();

                const prepRes = await fetch("/api/approval-attachments/upload", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        approvalId: record.approvalId,
                        fileName: record.fileName,
                    }),
                });

                const prepJson = await prepRes.json().catch(() => ({}));

                if (!prepRes.ok) {
                    const errorMessage =
                        prepJson?.error || "Failed to prepare approval attachment upload";

                    const normalizedError = String(errorMessage).toLowerCase();

                    if (
                        prepRes.status === 404 &&
                        normalizedError.includes("approval not found")
                    ) {
                        await removeOfflineApprovalAttachmentRecord(record.id);
                        continue;
                    }

                    if (
                        prepRes.status === 400 &&
                        normalizedError.includes("attachments can only be added to draft approvals")
                    ) {
                        await removeOfflineApprovalAttachmentRecord(record.id);
                        continue;
                    }

                    throw new Error(errorMessage);
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
                    throw new Error(`Direct upload failed (${uploadRes.status})`);
                }

                const insertRes = await fetch("/api/approval-attachments/insert", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        id: attachmentId,
                        approvalId: record.approvalId,
                        path,
                        fileName: record.fileName,
                        mimeType: record.mimeType,
                        sizeBytes: record.sizeBytes,
                    }),
                });

                const insertJson = await insertRes.json().catch(() => ({}));

                if (!insertRes.ok) {
                    throw new Error(
                        insertJson?.error || "Approval attachment metadata insert failed"
                    );
                }

                await removeOfflineApprovalAttachmentRecord(record.id);
                completedApprovalIds.add(record.approvalId);
            } catch (err: any) {
                await markOfflineApprovalAttachmentPending(
                    record.id,
                    err?.message || "Approval attachment upload failed"
                );
            }
        }

        if (typeof window !== "undefined" && completedApprovalIds.size > 0) {
            for (const approvalId of completedApprovalIds) {
                window.dispatchEvent(
                    new CustomEvent("buildproof-approval-attachment-complete", {
                        detail: { approvalId },
                    })
                );
            }

            window.dispatchEvent(new Event("buildproof-data-changed"));
        }
    } finally {
        isFlushing = false;
    }
}