import {
  claimPendingOfflineApproval,
  getPendingOfflineApprovals,
  markApprovalFailed,
  markApprovalSynced,
  removeOfflineApproval,
} from "@/lib/offlineApprovalOutbox";
import { attachServerApprovalIdToOfflineApprovalAttachments } from "@/lib/offlineApprovalAttachmentOutbox";
import { remapOfflineApprovalSendApprovalId } from "@/lib/offlineApprovalSendOutbox";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

let isFlushing = false;

export async function flushOfflineApprovalOutbox(
  getAccessToken: () => Promise<string>
) {
  if (isFlushing) return;
  if (!isOnline()) return;

  isFlushing = true;

  try {
    const records = await getPendingOfflineApprovals();

    for (const record of records) {
      try {
        const isNewOfflineApproval = record.id.startsWith("offline-");

        const isIncompleteDraft =
          isNewOfflineApproval &&
          (!record.recipientEmail || !record.recipientEmail.trim());

        const isStillOnOfflineProject =
          typeof record.projectId === "string" &&
          record.projectId.startsWith("offline-project-");

        if (isIncompleteDraft || isStillOnOfflineProject) {
          continue;
        }

        const claimed = await claimPendingOfflineApproval(record.id);
        if (!claimed) {
          continue;
        }

        const token = await getAccessToken();

        const endpoint = isNewOfflineApproval
          ? "/api/approvals/create"
          : "/api/approvals/update";

        // lineItems/isBaseline are only included when the queued record
        // actually has them set -- keeps parity with the API routes'
        // own conditional-inclusion behavior (approvals/create and
        // approvals/update leave the column at its default/existing value
        // when the field is absent from the request body entirely, rather
        // than treating "undefined" the same as "explicitly empty/false").
        const lineItemsAndBaseline: Record<string, unknown> = {};

        if (record.lineItems !== undefined) {
          lineItemsAndBaseline.lineItems = record.lineItems;
        }

        if (record.isBaseline !== undefined) {
          lineItemsAndBaseline.isBaseline = record.isBaseline;
        }

        const body = isNewOfflineApproval
                    ? {
            projectId: record.projectId,
            title: record.title,
            approvalType: record.approvalType,
            description: record.description,
            recipientName: record.recipientName,
            recipientEmail: record.recipientEmail,
            costDelta: record.costDelta,
            scheduleDelta: record.scheduleDelta,
            dueAt: record.dueAt,
            createdTimezoneId: record.createdTimezoneId,
            createdTimezoneOffsetMinutes: record.createdTimezoneOffsetMinutes,
            creatingUserId: record.creatingUserId,
            ...lineItemsAndBaseline,
          }
          : {
            approvalId: record.id,
            title: record.title,
            approvalType: record.approvalType,
            description: record.description,
            recipientName: record.recipientName,
            recipientEmail: record.recipientEmail,
            costDelta: record.costDelta,
            scheduleDelta: record.scheduleDelta,
            dueAt: record.dueAt,
            createdTimezoneId: record.createdTimezoneId,
            createdTimezoneOffsetMinutes: record.createdTimezoneOffsetMinutes,
            ...lineItemsAndBaseline,
          };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || "Failed to sync offline approval.");
        }

        const approvalId = json?.approval?.id || record.id;
        if (!approvalId) {
          throw new Error("Offline approval synced but missing server approval id.");
        }

        if (isNewOfflineApproval) {
          await attachServerApprovalIdToOfflineApprovalAttachments(record.id, approvalId);

          await remapOfflineApprovalSendApprovalId({
            offlineApprovalId: record.id,
            approvalId,
          });
        }

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
        await markApprovalFailed(record.id).catch(() => undefined);
        console.error("[flushOfflineApprovalOutbox] failed", record.id, err);
      }
    }
  } finally {
    isFlushing = false;
  }
}