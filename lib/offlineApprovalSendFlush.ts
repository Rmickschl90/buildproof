import { hasPendingOfflineApprovalAttachments } from "@/lib/offlineApprovalAttachmentOutbox";
import {
  getPendingOfflineApprovalSends,
  markOfflineApprovalSendFailed,
  markOfflineApprovalSendPending,
  markOfflineApprovalSendProcessing,
  removeOfflineApprovalSend,
} from "@/lib/offlineApprovalSendOutbox";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

let isFlushing = false;

export async function flushOfflineApprovalSendOutbox(
  getAccessToken: () => Promise<string>
): Promise<void> {
  if (isFlushing) return;
  if (!isOnline()) return;

  isFlushing = true;

  try {
    let pending = await getPendingOfflineApprovalSends();

    for (let pass = 0; pass < 2; pass++) {
      for (const record of pending) {
        if (!record.approvalId) {
          await markOfflineApprovalSendPending(
            record.id,
            "Approval is not synced yet."
          );
          continue;
        }

        const stillHasRelatedAttachments =
          await hasPendingOfflineApprovalAttachments({
            approvalId: record.approvalId,
            offlineApprovalId: record.offlineApprovalId,
          });

        if (stillHasRelatedAttachments) {
          await markOfflineApprovalSendPending(
            record.id,
            "Waiting for approval attachments to finish syncing."
          );
          continue;
        }

        try {
          const accessToken = await getAccessToken();

          const listResponse = await fetch("/api/approvals/list", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              projectId: record.projectId,
              includeArchived: true,
            }),
          });

          let listData: any = null;
          try {
            listData = await listResponse.json();
          } catch {}

          if (!listResponse.ok) {
            const message =
              listData?.error ||
              listData?.message ||
              `Approval list refresh failed (${listResponse.status})`;

            await markOfflineApprovalSendPending(record.id, message);
            continue;
          }

          const matchedApproval = (listData?.approvals || []).find(
            (item: any) => item.id === record.approvalId
          );

          if (!matchedApproval) {
            await markOfflineApprovalSendPending(
              record.id,
              "Waiting for approval to appear on server."
            );
            continue;
          }

          const serverAttachmentCount = Array.isArray(
            matchedApproval.attachments
          )
            ? matchedApproval.attachments.length
            : 0;

          if (serverAttachmentCount < record.expectedAttachmentCount) {
            await markOfflineApprovalSendPending(
              record.id,
              "Waiting for approval attachments to finish syncing."
            );
            continue;
          }

          await markOfflineApprovalSendProcessing(record.id);

          const response = await fetch("/api/approvals/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              approvalId: record.approvalId,
              idempotencyKey: record.sendIdempotencyKey,
              expectedAttachmentCount: record.expectedAttachmentCount,
            }),
          });

          let data: any = null;
          try {
            data = await response.json();
          } catch {}

          if (!response.ok) {
            const message =
              data?.error ||
              data?.message ||
              `Approval send failed (${response.status})`;

            await markOfflineApprovalSendPending(record.id, message);
            continue;
          }

          await removeOfflineApprovalSend(record.id);

          window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
          window.dispatchEvent(
            new CustomEvent("buildproof-approval-send-complete", {
              detail: {
                approvalId: record.approvalId,
                offlineApprovalId: record.offlineApprovalId,
              },
            })
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Approval send failed.";

          await markOfflineApprovalSendPending(record.id, message);
        }
      }

      pending = await getPendingOfflineApprovalSends();

      if (pending.length === 0) {
        break;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approval send flush failed.";
    console.error("[offlineApprovalSendFlush] flush failed:", message);

    const pending = await getPendingOfflineApprovalSends();
    for (const record of pending) {
      await markOfflineApprovalSendFailed(record.id, message);
    }
  } finally {
    isFlushing = false;
  }
}