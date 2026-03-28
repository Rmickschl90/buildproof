"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type DeliveryRow = {
  id: string;
  created_at: string;
  channel: "email" | "sms" | string;
  to_address: string | null;
  status: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  share_url?: string | null;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusBadge(statusRaw: string | null | undefined) {
  const s = (statusRaw || "").toLowerCase();
  if (s === "sent" || s === "delivered") return { text: "SENT", tone: "ok" as const };
  if (s === "failed" || s === "undelivered") return { text: "FAILED", tone: "bad" as const };
  if (s === "queued") return { text: "QUEUED", tone: "mid" as const };
  if (s === "sending") return { text: "SENDING", tone: "mid" as const };
  return { text: (statusRaw || "UNKNOWN").toUpperCase(), tone: "mid" as const };
}

function pillStyle(tone: "ok" | "mid" | "bad") {
  if (tone === "ok") {
    return {
      border: "1px solid rgba(15,23,42,0.14)",
      background: "rgba(15,23,42,0.03)",
      color: "rgba(15,23,42,0.92)",
    };
  }
  if (tone === "bad") {
    return {
      border: "1px solid rgba(220,38,38,0.30)",
      background: "rgba(220,38,38,0.06)",
      color: "#b91c1c",
    };
  }
  return {
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(15,23,42,0.02)",
    color: "rgba(15,23,42,0.85)",
  };
}

export default function DeliveryHistoryPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Not logged in");
    return token;
  }

  async function load() {
    try {
      setLoading(true);
      setStatusText("");

      const token = await getAccessToken();

      const res = await fetch(`/api/deliveries/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId, limit }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load deliveries");

      const list = (json.rows ?? []) as DeliveryRow[];
      setRows(list);
      if (list.length === 0) {
        setStatusText("No deliveries yet.");
      } else {
        setStatusText("");
      }
    } catch (e: any) {
      setRows([]);
      setStatusText(e?.message ?? "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function refresh() {
      load();
    }

    window.addEventListener("buildproof-send-complete", refresh);

    return () => {
      window.removeEventListener("buildproof-send-complete", refresh);
    };
  }, []);

  useEffect(() => {
    setRows([]);
    setStatusText("");
    setOpen(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, open]);

  useEffect(() => {
    const id = window.setInterval(() => {
      load();
    }, 10000);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, limit]);

  useEffect(() => {
    function handleFocus() {
      load();
    }

    function handleVisible() {
      if (document.visibilityState === "visible") {
        load();
      }
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, limit]);

  const hasRows = rows.length > 0;
  const latest = rows[0];
  const latestB = statusBadge(latest?.status);

  const summary = useMemo(() => {
    const total = rows.length;
    const sent = rows.filter((r) => ["sent", "delivered"].includes((r.status || "").toLowerCase())).length;
    const failed = rows.filter((r) => ["failed", "undelivered"].includes((r.status || "").toLowerCase())).length;
    return { total, sent, failed };
  }, [rows]);

  return (
    <div
      style={{
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 16,
        padding: 14,
        background: "#fff",
        marginBottom: 12,
      }}
    >
      <div
        className="row"
        style={{
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>Delivery history</div>

          {!open ? (
            <div className="sub" style={{ marginTop: 2 }}>
              {hasRows ? (
                <>
                  Last: <b>{latest.channel.toUpperCase()}</b> →{" "}
                  <span style={{ fontWeight: 700, wordBreak: "break-word" }}>{latest.to_address}</span>{" "}
                  <span style={{ opacity: 0.7 }}>• {formatWhen(latest.created_at)}</span>
                </>
              ) : (
                statusText || "No deliveries yet."
              )}
            </div>
          ) : (
            <div className="sub" style={{ marginTop: 2 }}>
              Total: <b>{summary.total}</b> • Sent: <b>{summary.sent}</b> • Failed:{" "}
              <b>{summary.failed}</b>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            width: "100%",
          }}
        >
          {!open && hasRows && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                padding: "6px 10px",
                borderRadius: 999,
                ...pillStyle(latestB.tone),
              }}
            >
              {latestB.text}
            </div>
          )}

          <button
            className="btn"
            onClick={() => setOpen((v) => !v)}
            style={{
              whiteSpace: "normal",
              maxWidth: "100%",
            }}
          >
            {open ? "Hide" : "View"}
          </button>

          <button
            className="btn"
            onClick={load}
            disabled={loading}
            style={{
              whiteSpace: "normal",
              maxWidth: "100%",
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {open && hasRows && (
        <>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              className="input"
              style={{ width: 140, maxWidth: "100%" }}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={10}>Last 10</option>
              <option value={25}>Last 25</option>
              <option value={50}>Last 50</option>
            </select>

            <button
              className="btn"
              onClick={() => setShowDetails((v) => !v)}
              style={{
                whiteSpace: "normal",
                maxWidth: "100%",
              }}
            >
              {showDetails ? "Hide details" : "Show details"}
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: 14,
              padding: 10,
              background: "rgba(15,23,42,0.02)",
              display: "grid",
              gap: 8,
            }}
          >
            {rows.map((r) => {
              const b = statusBadge(r.status);
              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div
                    className="row"
                    style={{
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}>
                      {r.channel.toUpperCase()} → {r.to_address}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        padding: "6px 10px",
                        borderRadius: 999,
                        ...pillStyle(b.tone),
                      }}
                    >
                      {b.text}
                    </div>
                  </div>

                  <div className="sub" style={{ marginTop: 4 }}>
                    {formatWhen(r.created_at)}
                    {showDetails && r.provider ? ` • ${r.provider}` : ""}
                    {showDetails && r.provider_message_id ? ` • ${r.provider_message_id}` : ""}
                  </div>

                  {r.share_url && showDetails && (
                    <div style={{ marginTop: 6, fontSize: 13, wordBreak: "break-word" }}>
                      <span style={{ opacity: 0.7 }}>Link:</span>{" "}
                      <a className="deliveryLink" href={r.share_url} target="_blank" rel="noreferrer">
                        {r.share_url}
                      </a>
                    </div>
                  )}

                  {showDetails && r.error && (
                    <div style={{ marginTop: 6, fontSize: 13, color: "#b91c1c", wordBreak: "break-word" }}>
                      {r.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}