"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getAllOfflineSendRecords } from "@/lib/offlineSendOutbox";

type Props = {
  projectId: string;
};

type OfflineSendRecord = {
  id: string;
  idempotencyKey: string;
  projectId: string;
  toEmail: string;
  includeArchived: boolean;
  status: "pending" | "syncing" | "handed_off";
  createdAt: string;
  updatedAt: string;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
  serverJobId: string | null;
};

type ActiveJob = {
  id: string;
  status: string;
  attempt_count?: number | null;
  last_error?: string | null;
  next_retry_at?: string | null;
  processed_at?: string | null;
  started_at?: string | null;
} | null;

type StatusSummary = {
  latestJob: {
    id: string;
    status: string;
    created_at: string | null;
    processed_at: string | null;
    share_url?: string | null;
  } | null;
  latestDelivery: {
    id: string;
    status: string;
    to_address: string | null;
    created_at: string | null;
    provider_message_id: string | null;
    error: string | null;
  } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function SendDiagnosticsPanel({ projectId }: Props) {
  const [outboxRecords, setOutboxRecords] = useState<OfflineSendRecord[]>([]);
  const [activeJob, setActiveJob] = useState<ActiveJob>(null);
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({
    latestJob: null,
    latestDelivery: null,
  });
  const [errorText, setErrorText] = useState("");

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("Not logged in");

    return token;
  }

  async function loadOutbox() {
    const all = await getAllOfflineSendRecords();
    setOutboxRecords(all.filter((r) => r.projectId === projectId));
  }

  async function loadActiveJob() {
    const token = await getAccessToken();

    const res = await fetch(`/api/send/active-job?projectId=${projectId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to load active job");
    }

    setActiveJob(json?.job ?? null);
  }

  async function loadStatusSummary() {
    const token = await getAccessToken();

    const res = await fetch(`/api/send/status-summary?projectId=${projectId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Failed to load send status summary");
    }

    setStatusSummary({
      latestJob: json?.latestJob ?? null,
      latestDelivery: json?.latestDelivery ?? null,
    });
  }

  async function refreshAll() {
    try {
      setErrorText("");
      await Promise.all([loadOutbox(), loadActiveJob(), loadStatusSummary()]);
    } catch (e: any) {
      setErrorText(e?.message || "Diagnostics refresh failed");
    }
  }

  useEffect(() => {
    function handleFocus() {
      refreshAll();
    }

    function handleOnline() {
      refreshAll();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    }

    function handleSendComplete() {
      refreshAll();
    }

    refreshAll();

    const interval = window.setInterval(() => {
      refreshAll();
    }, 4000);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener(
      "buildproof-send-complete",
      handleSendComplete as EventListener
    );
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(
        "buildproof-send-complete",
        handleSendComplete as EventListener
      );
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [projectId]);

  const queuedCount = outboxRecords.length;

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: 14,
        border: "1px dashed rgba(15,23,42,0.18)",
        background: "rgba(15,23,42,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          opacity: 0.65,
        }}
      >
        Send Diagnostics
      </div>

      {errorText ? (
        <div className="sub" style={{ color: "#b91c1c", fontWeight: 700 }}>
          {errorText}
        </div>
      ) : null}

      <div className="sub" style={{ fontWeight: 700 }}>
        Outbox Records: {queuedCount}
      </div>

      {outboxRecords.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {outboxRecords.map((record) => (
            <div
              key={record.id}
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.08)",
                background: "#fff",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              <div><strong>Status:</strong> {record.status}</div>
              <div><strong>To:</strong> {record.toEmail}</div>
              <div><strong>Attempts:</strong> {record.syncAttemptCount}</div>
              <div><strong>Server Job:</strong> {record.serverJobId || "—"}</div>
              <div><strong>Last Sync Attempt:</strong> {formatDate(record.lastSyncAttemptAt)}</div>
              <div><strong>Last Error:</strong> {record.lastError || "—"}</div>
              <div><strong>Created:</strong> {formatDate(record.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sub" style={{ opacity: 0.75 }}>
          No queued outbox records
        </div>
      )}

      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: "1px solid rgba(15,23,42,0.08)",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700 }}>Active Server Job</div>
        <div className="sub">ID: {activeJob?.id || "—"}</div>
        <div className="sub">Status: {activeJob?.status || "—"}</div>
        <div className="sub">Attempts: {activeJob?.attempt_count ?? "—"}</div>
        <div className="sub">Started: {formatDate(activeJob?.started_at)}</div>
        <div className="sub">Processed: {formatDate(activeJob?.processed_at)}</div>
        <div className="sub">Next Retry: {formatDate(activeJob?.next_retry_at)}</div>
        <div className="sub">Last Error: {activeJob?.last_error || "—"}</div>
      </div>

      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: "1px solid rgba(15,23,42,0.08)",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700 }}>Latest Job Summary</div>
        <div className="sub">Job ID: {statusSummary.latestJob?.id || "—"}</div>
        <div className="sub">Job Status: {statusSummary.latestJob?.status || "—"}</div>
        <div className="sub">
          Job Processed: {formatDate(statusSummary.latestJob?.processed_at)}
        </div>
      </div>

      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: "1px solid rgba(15,23,42,0.08)",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700 }}>Latest Delivery</div>
        <div className="sub">Status: {statusSummary.latestDelivery?.status || "—"}</div>
        <div className="sub">To: {statusSummary.latestDelivery?.to_address || "—"}</div>
        <div className="sub">
          Created: {formatDate(statusSummary.latestDelivery?.created_at)}
        </div>
        <div className="sub">
          Provider ID: {statusSummary.latestDelivery?.provider_message_id || "—"}
        </div>
        <div className="sub">Error: {statusSummary.latestDelivery?.error || "—"}</div>
      </div>
    </div>
  );
}