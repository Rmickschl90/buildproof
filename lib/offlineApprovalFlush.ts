import {
    claimPendingOfflineApproval,
    getPendingOfflineApprovals,
    markApprovalFailed,
    markApprovalSynced,
    removeOfflineApproval,
} from "@/lib/offlineApprovalOutbox";
import { attachServerApprovalIdToOfflineApprovalAttachments } from "@/lib/offlineApprovalAttachmentOutbox";

function isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;

}

export async function flushOfflineApprovalOutbox(
    getAccessToken: () => Promise<string>
) {
    if (!isOnline()) return;

    const records = await getPendingOfflineApprovals();

    for (const record of records) {
        try {
            const claimed = await claimPendingOfflineApproval(record.id);
            if (!claimed) {
                continue;
            }

            const token = await getAccessToken();

            const res = await fetch("/api/approvals/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    projectId: record.projectId,
                    title: record.title,
                    approvalType: record.approvalType,
                    description: record.description,
                    recipientName: record.recipientName,
                    recipientEmail: record.recipientEmail,
                    costDelta: record.costDelta,
                    scheduleDelta: record.scheduleDelta,
                    dueAt: record.dueAt,
                }),
            });

            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(json?.error || "Failed to sync offline approval.");
            }

            const approvalId = json?.approval?.id;
            if (!approvalId) {
                throw new Error("Offline approval synced but missing server approval id.");
            }

            await attachServerApprovalIdToOfflineApprovalAttachments(record.id, approvalId);
            await markApprovalSynced(record.id);
            await removeOfflineApproval(record.id);

            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent("buildproof-offline-approval-sync-complete", {
                        detail: {
                            offlineApprovalId: record.id,
                            approvalId,
                        },
                    })
                );
            }
        } catch (err: any) {
            await markApprovalFailed(
                record.id
            ).catch(() => undefined);

            console.error("[flushOfflineApprovalOutbox] failed", record.id, err);
        }
    }
}