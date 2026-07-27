import {
  getFlushableOfflineSendRecords,
  markOfflineSendFailed,
  markOfflineSendHandedOff,
  markOfflineSendPending,
  markOfflineSendSyncing,
  removeOfflineSendRecord,
  type OfflineSendRecord,
} from "@/lib/offlineSendOutbox";
import { listPendingOfflineProofs } from "@/lib/offlineProofOutbox";
import { getAllOfflineAttachmentRecords } from "@/lib/offlineAttachmentOutbox";
import type { SendUiStatus } from "@/lib/sendStatus";

type FlushStatusCallback = (
  status: SendUiStatus,
  meta?: { message?: string }
) => void;

type FlushOptions = {
  getAccessToken: () => Promise<string>;
  onStatus?: FlushStatusCallback;
};

let flushInProgress = false;

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

async function hasUnfinishedEntryAttachmentsForProject(projectId: string) {
  const attachments = await getAllOfflineAttachmentRecords();

  return attachments.some(
    (attachment) =>
      attachment.projectId === projectId &&
      (attachment.status === "pending" || attachment.status === "uploading")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stuck-send fix (2026-07-27): a permanently-invalid recipient (e.g. a bad
// test email Resend rejects) used to get reset back to "pending" forever with
// no cap, since every failure path here previously called
// markOfflineSendPending unconditionally -- see REGRESSION_LEDGER.md /
// CLAUDE.md for the incident this closes out. Two independent safeguards so
// neither has to be perfect on its own:
//   1. Pattern-match known permanent, retry-proof failures (bad recipient
//      address, unverified sending domain) and fail them immediately.
//   2. A hard attempt cap as a backstop for anything the pattern match
//      misses or misclassifies -- nothing can loop forever regardless.
const MAX_SEND_ATTEMPTS = 5;

function isLikelyPermanentSendError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("invalid `to`") ||
    m.includes("invalid to field") ||
    m.includes("invalid recipient") ||
    m.includes("invalid email") ||
    m.includes("not a valid email") ||
    m.includes("testing email address") ||
    m.includes("domain is not verified") ||
    m.includes("domain not verified")
  );
}

// Decides whether a failure should permanently stop this record (terminal
// "failed") or go back to "pending" for another automatic retry later.
// Centralized so all 4 failure sites below apply the exact same rule.
async function recordSendFailure(
  record: OfflineSendRecord,
  message: string,
  onStatus?: FlushStatusCallback
) {
  const shouldStop =
    isLikelyPermanentSendError(message) ||
    record.syncAttemptCount >= MAX_SEND_ATTEMPTS;

  if (shouldStop) {
    await markOfflineSendFailed(record.id, message);
  } else {
    await markOfflineSendPending(record.id, message);
  }

  onStatus?.("failed", { message });
}

async function createSendJob(record: OfflineSendRecord, token: string) {
  const res = await fetch("/api/send/create-job", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      projectId: record.projectId,
      toEmail: record.toEmail,
      includeArchived: record.includeArchived,
      idempotencyKey: record.idempotencyKey,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "Failed to create send job.");
  }

  return data;
}

async function processSendJob(jobId: string, token: string) {
  const res = await fetch("/api/send/process-job", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jobId }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok && res.status !== 202) {
    throw new Error(data?.error || "Failed to process send job.");
  }

  return data;
}

async function getJobStatus(jobId: string, token: string) {
  const res = await fetch(`/api/send/job-status?id=${jobId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || "Failed to read send job status.");
  }

  return data?.job ?? null;
}

function isTerminalSuccess(status: string | null | undefined) {
  return status === "sent" || status === "completed" || status === "success";
}

function isStillRunning(status: string | null | undefined) {
  return (
    status === "pending" ||
    status === "queued" ||
    status === "processing" ||
    status === "retrying" ||
    status === "finalizing"
  );
}

async function waitForTerminalJobStatus(
  jobId: string,
  token: string,
  onStatus?: FlushStatusCallback
) {
  const maxAttempts = 30;
const delayMs = 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isOnline()) {
      throw new Error("Connection lost during job status polling.");
    }

    const job = await getJobStatus(jobId, token);
    const jobStatus = String(job?.status || "");

    if (isTerminalSuccess(jobStatus)) {
      return job;
    }

    if (jobStatus === "failed") {
      return job;
    }

    if (jobStatus === "pending") {
      onStatus?.("creating_job", { message: "Preparing send..." });
    } else if (jobStatus === "processing" || jobStatus === "retrying") {
      onStatus?.("sending_job", { message: "Sending update..." });
    } else if (jobStatus === "finalizing") {
      onStatus?.("finalizing_entries", { message: "Finalizing entries..." });
    }

    if (!isStillRunning(jobStatus)) {
      return job;
    }

    await processSendJob(jobId, token).catch(() => { });

    await sleep(delayMs);
  }

  return await getJobStatus(jobId, token);
}

export async function flushOfflineSendOutbox(
  options: FlushOptions
): Promise<{
  flushed: number;
  failed: number;
}> {
  if (flushInProgress) {
    return { flushed: 0, failed: 0 };
  }

  flushInProgress = true;

  try {
    const { getAccessToken, onStatus } = options;

    const records = await getFlushableOfflineSendRecords();

    if (!records.length) {
      return { flushed: 0, failed: 0 };
    }

    if (!isOnline()) {
      onStatus?.("queued_offline");
      return { flushed: 0, failed: records.length };
    }

    let flushed = 0;
    let failed = 0;

    const token = await getAccessToken();

    for (const record of records) {
      try {
        if (!isOnline()) {
          await markOfflineSendPending(record.id, "Offline during flush.");
          onStatus?.("queued_offline");
          failed += 1;
          continue;
        }

        const pendingProofs = await listPendingOfflineProofs();
        const hasPendingProofsForProject = pendingProofs.some(
          (proof) => proof.projectId === record.projectId
        );

        if (hasPendingProofsForProject) {
          await markOfflineSendPending(
            record.id,
            "Entries still syncing — try again in a moment.",
            "entries"
          );

          onStatus?.("queued_offline", {
            message: "Waiting for latest entries to finish syncing...",
          });

          continue;
        }

        const hasUnfinishedAttachmentsForProject =
          await hasUnfinishedEntryAttachmentsForProject(record.projectId);

        if (hasUnfinishedAttachmentsForProject) {
          await markOfflineSendPending(
            record.id,
            "Entry attachments still uploading — try again in a moment.",
            "entry_attachments"
          );

          onStatus?.("queued_offline", {
            message: "Waiting for entry attachments to finish uploading...",
          });

          continue;
        }

        let jobId = record.serverJobId;

        if (jobId) {
          const existingJob = await getJobStatus(jobId, token);
          const existingJobStatus = String(existingJob?.status || "");

          if (isTerminalSuccess(existingJobStatus)) {
            await removeOfflineSendRecord(record.id);
            flushed += 1;
            onStatus?.("sent", { message: "Update already sent" });

            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("buildproof-send-complete"));
            }

            continue;
          }

          if (existingJobStatus === "failed") {
            await recordSendFailure(
              record,
              existingJob?.last_error || "Send job failed.",
              onStatus
            );
            failed += 1;

            continue;
          }
        }

        if (record.status === "pending") {
          onStatus?.("creating_job", { message: "Preparing send..." });

          await markOfflineSendSyncing(record.id);

          const createData = await createSendJob(record, token);
          jobId = String(createData?.job?.id || createData?.jobId || "");

          if (!jobId) {
            throw new Error("Missing job id from create-job response.");
          }

          await markOfflineSendHandedOff(record.id, jobId);
        }

        if (!jobId) {
          throw new Error("Missing server job id for handed off record.");
        }

        const preProcessJob = await getJobStatus(jobId, token);
        const preProcessStatus = String(preProcessJob?.status || "");

        if (isTerminalSuccess(preProcessStatus)) {
          await removeOfflineSendRecord(record.id);
          flushed += 1;
          onStatus?.("sent", { message: "Update already sent" });

          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("buildproof-send-complete"));
          }

          continue;
        }

        if (preProcessStatus === "failed") {
          await recordSendFailure(
            record,
            preProcessJob?.last_error || "Send job failed.",
            onStatus
          );
          failed += 1;

          continue;
        }

        onStatus?.("sending_job", { message: "Sending update..." });

        await processSendJob(jobId, token);

        const job = await waitForTerminalJobStatus(jobId, token, onStatus);
        const jobStatus = String(job?.status || "");

        if (isTerminalSuccess(jobStatus)) {
          onStatus?.("finalizing_entries", { message: "Finalizing entries..." });
          await removeOfflineSendRecord(record.id);
          flushed += 1;
          onStatus?.("sent", { message: "Update sent" });

          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("buildproof-send-complete"));
          }

          continue;
        }

        if (jobStatus === "failed") {
          await recordSendFailure(
            record,
            job?.last_error || "Send job failed.",
            onStatus
          );
          failed += 1;

          continue;
        }

        onStatus?.("sending_job", {
          message: "Send still processing — will continue automatically.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown send failure.";

        if (
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("networkerror") ||
          message.toLowerCase().includes("connection lost") ||
          !isOnline()
        ) {
          onStatus?.("queued_offline", {
            message:
              "Update saved — will send automatically when connection returns.",
          });
        } else {
          await recordSendFailure(record, message, onStatus);
        }

        failed += 1;
      }
    }

    return { flushed, failed };
  } finally {
    flushInProgress = false;
  }
}