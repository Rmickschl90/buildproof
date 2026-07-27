"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getFlushableOfflineSendRecords,
  getFailedOfflineSendRecords,
  removeOfflineSendRecord,
  createOfflineSendRecord,
  createSendIdempotencyKey,
  type OfflineSendRecord,
} from "@/lib/offlineSendOutbox";
import { getFlushableOfflineApprovalSendRecords } from "@/lib/offlineApprovalSendOutbox";

export default function OfflineSendIndicator() {
  const pathname = usePathname();

  const [queuedCount, setQueuedCount] = useState(0);
  const [approvalQueuedCount, setApprovalQueuedCount] = useState(0);
  const [topReason, setTopReason] = useState<string | null>(null);
  const [failedRecords, setFailedRecords] = useState<OfflineSendRecord[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  async function refreshQueuedCount() {
    try {
      const [records, approvalRecords, failed] = await Promise.all([
        getFlushableOfflineSendRecords(),
        getFlushableOfflineApprovalSendRecords(),
        getFailedOfflineSendRecords(),
      ]);

      const trulyQueued = records.filter((record: any) => {
        const status = String(record?.status || "").toLowerCase();
        return status === "pending" || status === "syncing";
      });

      const trulyQueuedApprovals = approvalRecords.filter((record: any) => {
        const status = String(record?.status || "").toLowerCase();
        return status === "pending" || status === "processing";
      });

      setQueuedCount(trulyQueued.length);
      setApprovalQueuedCount(trulyQueuedApprovals.length);
      setFailedRecords(failed);

      const first = trulyQueued[0];
      setTopReason(first?.waitReason || null);
    } catch {
      setQueuedCount(0);
      setApprovalQueuedCount(0);
      setFailedRecords([]);
      setTopReason(null);
    }
  }

  async function dismissFailedRecord(id: string) {
    try {
      await removeOfflineSendRecord(id);
    } finally {
      setRetryErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refreshQueuedCount();
    }
  }

  // Retry, not just dismiss: re-reads the project's CURRENT client email
  // (rather than trusting the failed record's stale snapshot -- the whole
  // reason the original bug looked "stuck" even after the email was fixed)
  // and re-queues a brand-new record under it, then flushes immediately if
  // online. If the project still has no client email at all, surfaces that
  // inline instead of silently failing the same way again.
  async function retryFailedRecord(record: OfflineSendRecord) {
    setRetryingId(record.id);
    setRetryErrors((prev) => {
      const next = { ...prev };
      delete next[record.id];
      return next;
    });

    try {
      const { supabase } = await import("@/lib/supabase");

      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .select("client_email")
        .eq("id", record.projectId)
        .single();

      const freshEmail = projectRow?.client_email?.trim();

      if (projectError || !freshEmail) {
        setRetryErrors((prev) => ({
          ...prev,
          [record.id]:
            "No client email on file for this project — add one, then use Send Update from the project.",
        }));
        return;
      }

      await removeOfflineSendRecord(record.id);

      await createOfflineSendRecord({
        projectId: record.projectId,
        toEmail: freshEmail,
        includeArchived: record.includeArchived,
        idempotencyKey: createSendIdempotencyKey(),
        creatingUserId: record.creatingUserId,
      });

      await refreshQueuedCount();

      if (navigator.onLine) {
        const { flushOfflineSendOutbox } = await import("@/lib/offlineSendFlush");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (token) {
          await flushOfflineSendOutbox({ getAccessToken: async () => token });
          await refreshQueuedCount();
        }
      }
    } catch (err) {
      setRetryErrors((prev) => ({
        ...prev,
        [record.id]: "Retry failed to start — try again in a moment.",
      }));
    } finally {
      setRetryingId(null);
    }
  }

  useEffect(() => {
    async function tryFlushSends() {
      if (!navigator.onLine) return;

      try {
        const { flushOfflineSendOutbox } = await import("@/lib/offlineSendFlush");
        const { supabase } = await import("@/lib/supabase");

        const { data, error } = await supabase.auth.getSession();
        if (error) return;

        const token = data.session?.access_token;
        if (!token) return;

        await flushOfflineSendOutbox({
          getAccessToken: async () => token,
        });

        await refreshQueuedCount();
      } catch {
        // keep indicator silent
      }
    }

    function handleFocus() {
      refreshQueuedCount();
    }

    function handleOnline() {
      refreshQueuedCount();
      void tryFlushSends();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshQueuedCount();
      }
    }

    function handleSendComplete() {
      refreshQueuedCount();
    }

    const interval = window.setInterval(() => {
      refreshQueuedCount();
    }, 3000);

    refreshQueuedCount();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("buildproof-send-complete", handleSendComplete as EventListener);
    window.addEventListener("buildproof-attachment-complete", tryFlushSends);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("buildproof-send-complete", handleSendComplete as EventListener);
      window.removeEventListener("buildproof-attachment-complete", tryFlushSends);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const totalQueuedCount = queuedCount + approvalQueuedCount;

  if (pathname?.startsWith("/share")) return null;
  if (totalQueuedCount <= 0 && failedRecords.length === 0) return null;

  const updateText =
    queuedCount > 0
      ? `${queuedCount} update${queuedCount === 1 ? "" : "s"}`
      : "";

  const approvalText =
    approvalQueuedCount > 0
      ? `${approvalQueuedCount} approval${approvalQueuedCount === 1 ? "" : "s"}`
      : "";

  const combinedText =
    updateText && approvalText
      ? `${updateText} and ${approvalText} waiting to send`
      : `${updateText || approvalText} waiting to send`;

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1000, width: "100%" }}>
      {totalQueuedCount > 0 ? (
        <div
          style={{
            padding: "10px 14px",
            background: "#fef3c7",
            borderBottom: "1px solid #f59e0b",
            color: "#92400e",
            fontWeight: 700,
            fontSize: 14,
            textAlign: "center",
          }}
        >
          ⚡{" "}
          {topReason === "entry_attachments"
            ? "Waiting for attachments to finish uploading..."
            : topReason === "entries"
              ? "Waiting for entries to finish syncing..."
              : combinedText}
        </div>
      ) : null}

      {/* Stuck-send fix (2026-07-27): these are records that hit a terminal
          "failed" state (permanent error or exhausted retries) -- they will
          NOT auto-retry anymore (see lib/offlineSendFlush.ts's
          recordSendFailure), so they need to be surfaced somewhere or they'd
          just silently sit there forever with no feedback to the user.
          Retry re-reads the project's current client email (not the stale
          snapshot on the failed record) and requeues fresh; Dismiss just
          removes it without resending. */}
      {failedRecords.length > 0 ? (
        <div
          style={{
            padding: "10px 14px",
            background: "#fee2e2",
            borderBottom: "1px solid #dc2626",
            color: "#991b1b",
            fontSize: 13,
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            ⚠ {failedRecords.length} update
            {failedRecords.length === 1 ? "" : "s"} couldn't be sent
          </div>

          {failedRecords.map((record) => (
            <div key={record.id} style={{ display: "grid", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  To <b>{record.toEmail}</b>: {record.lastError || "Send failed"}
                </span>

                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => retryFailedRecord(record)}
                    disabled={retryingId === record.id}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #991b1b",
                      background: "#991b1b",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: retryingId === record.id ? "default" : "pointer",
                      opacity: retryingId === record.id ? 0.6 : 1,
                    }}
                  >
                    {retryingId === record.id ? "Retrying..." : "Retry"}
                  </button>

                  <button
                    onClick={() => dismissFailedRecord(record.id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      border: "1px solid #dc2626",
                      background: "#fff",
                      color: "#991b1b",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {retryErrors[record.id] ? (
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {retryErrors[record.id]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}