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
    const pending = await getPendingOfflineApprovalSends();

    for (const record of pending) {
      if (!record.approvalId) {
        await markOfflineApprovalSendPending(
          record.id,
          "Approval is not synced yet."
        );
        continue;
      }

      const stillUploadingAttachments = await hasPendingOfflineApprovalAttachments(
        {
          approvalId: record.approvalId,
          offlineApprovalId: record.offlineApprovalId,
        }
      );

      if (stillUploadingAttachments) {
        await markOfflineApprovalSendPending(
          record.id,
          "Waiting for approval attachments to finish uploading."
        );
        continue;
      }

      await markOfflineApprovalSendProcessing(record.id);

      try {
        const accessToken = await getAccessToken();

        const response = await fetch("/api/approvals/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            approvalId: record.approvalId,
            idempotencyKey: record.sendIdempotencyKey,
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