import {
  claimPendingOfflinePayment,
  getPendingOfflinePayments,
  markPaymentFailed,
  removeOfflinePayment,
} from "@/lib/offlinePaymentOutbox";

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

let isFlushing = false;

export async function flushOfflinePaymentOutbox(
  getAccessToken: () => Promise<string>
) {
  if (isFlushing) return;
  if (!isOnline()) return;

  isFlushing = true;

  try {
    const records = await getPendingOfflinePayments();

    for (const record of records) {
      try {
        const isStillOnOfflineProject =
          typeof record.projectId === "string" &&
          record.projectId.startsWith("offline-project-");

        if (isStillOnOfflineProject) {
          continue;
        }

        const claimed = await claimPendingOfflinePayment(record.id);
        if (!claimed) {
          continue;
        }

        const token = await getAccessToken();

        const res = await fetch("/api/payments/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: record.projectId,
            amount: record.amount,
            note: record.note,
            paidAt: record.paidAt,
            creatingUserId: record.creatingUserId,
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || "Failed to sync offline payment.");
        }

        await removeOfflinePayment(record.id);

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("buildproof-offline-payment-sync-complete", {
              detail: {
                offlinePaymentId: record.id,
                paymentId: json?.payment?.id,
              },
            })
          );
        }
      } catch (err: any) {
        await markPaymentFailed(record.id).catch(() => undefined);
        console.error("[flushOfflinePaymentOutbox] failed", record.id, err);
      }
    }
  } finally {
    isFlushing = false;
  }
}
