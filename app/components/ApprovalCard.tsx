"use client";

import { useRef, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  createApprovalSendIdempotencyKey,
  createOfflineApprovalSendId,
  hasPendingOfflineApprovalSend,
  putOfflineApprovalSend,
} from "@/lib/offlineApprovalSendOutbox";

type ApprovalStatus = "draft" | "pending" | "approved" | "declined" | "expired";

type ApprovalAttachment = {
  id: string;
  filename: string | null;
  mime_type: string | null;
  path: string;
};

type Approval = {
  id: string;
  title: string;
  approval_type: string;
  description: string;
  status: ApprovalStatus;
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  expired_at: string | null;
  archived_at?: string | null;
  cost_delta: number | null;
  schedule_delta: string | null;
  recipient_name: string | null;
  recipient_email: string;
  project_id: string;
  created_timezone_id?: string | null;
  created_timezone_offset_minutes?: number | null;
  attachments?: ApprovalAttachment[];
};

type Props = {
  approval: Approval;
  onUpdated?: () => void | Promise<void>;
  onEdit?: (approval: Approval) => void;
};

function formatApprovalType(value: string) {
  switch (value) {
    case "change_order":
      return "Change Order";
    case "scope":
      return "Scope";
    case "material":
      return "Material";
    case "schedule":
      return "Schedule";
    default:
      return "General";
  }
}

function formatWhen(
  value: string | null,
  timezoneOffsetMinutes?: number | null
) {
  if (!value) return null;

  try {
    const utc = new Date(value);

    if (
      typeof timezoneOffsetMinutes === "number" &&
      !Number.isNaN(timezoneOffsetMinutes)
    ) {
      const wallClock = new Date(
        utc.getTime() - timezoneOffsetMinutes * 60000
      );

      return wallClock.toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return utc.toLocaleString();
  } catch {
    return value;
  }
}

function getStatusColors(status: ApprovalStatus) {
  const base = {
    border: "1px solid rgba(37,99,235,0.18)",
    left: "6px solid #2563eb",
    bg: "rgba(255,255,255,0.98)",
  };

  if (status === "approved") {
    return {
      ...base,
      pillBorder: "1px solid rgba(16,185,129,0.35)",
      pillBg: "rgba(16,185,129,0.08)",
      pillColor: "#065f46",
    };
  }

  if (status === "declined") {
    return {
      ...base,
      pillBorder: "1px solid rgba(239,68,68,0.35)",
      pillBg: "rgba(239,68,68,0.08)",
      pillColor: "#991b1b",
    };
  }

  if (status === "expired") {
    return {
      ...base,
      pillBorder: "1px solid rgba(100,116,139,0.35)",
      pillBg: "rgba(100,116,139,0.08)",
      pillColor: "#334155",
    };
  }

  return {
    ...base,
    pillBorder: "1px solid rgba(37,99,235,0.35)",
    pillBg: "rgba(37,99,235,0.08)",
    pillColor: "#1d4ed8",
  };
}

function getStatusLabel(status: ApprovalStatus) {
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "expired") return "Expired";
  if (status === "draft") return "Draft";
  return "Pending";
}

export default function ApprovalCard({ approval, onUpdated, onEdit }: Props) {
  const colors = getStatusColors(approval.status);
  const isArchived = !!approval.archived_at;
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const el = menuRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setMenuOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function queueApprovalSendOffline() {
    const alreadyQueued = await hasPendingOfflineApprovalSend({
      approvalId: approval.id,
      offlineApprovalId: null,
    });

    if (alreadyQueued) {
      alert("Approval already queued — will send when connected.");
      setMenuOpen(false);
      return;
    }

    const now = new Date().toISOString();

    await putOfflineApprovalSend({
      id: createOfflineApprovalSendId(),
      approvalId: approval.id,
      offlineApprovalId: null,
      projectId: approval.project_id,
      expectedAttachmentCount: approval.attachments?.length || 0,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      syncAttemptCount: 0,
      lastSyncAttemptAt: null,
      lastError: null,
      sendIdempotencyKey: createApprovalSendIdempotencyKey(),
    });

    window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
    alert("Approval queued — will send when connected.");
    setMenuOpen(false);
    await onUpdated?.();
  }

  async function sendApproval() {
    try {
      const isOffline =
        typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        await queueApprovalSendOffline();
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Missing bearer token");

      const res = await fetch("/api/approvals/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId: approval.id,
          idempotencyKey: createApprovalSendIdempotencyKey(),
          expectedAttachmentCount: approval.attachments?.length || 0,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const message = String(json?.error || "Send failed.");
        const looksOffline =
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network") ||
          message.toLowerCase().includes("fetch");

        if (looksOffline) {
          await queueApprovalSendOffline();
          return;
        }

        alert(message);
        return;
      }

      setMenuOpen(false);
      await onUpdated?.();
    } catch (err: any) {
      const message = String(err?.message || "Send failed.");
      const looksOffline =
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network") ||
        message.toLowerCase().includes("fetch");

      if (looksOffline) {
        await queueApprovalSendOffline();
        return;
      }

      alert(message);
    }
  }

  async function archiveApproval() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Missing bearer token");

      const res = await fetch("/api/approvals/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId: approval.id,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Archive failed.");
        return;
      }

      setMenuOpen(false);
      await onUpdated?.();
    } catch (err: any) {
      alert(err?.message || "Archive failed.");
    }
  }

  async function restoreApproval() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Missing bearer token");

      const res = await fetch("/api/approvals/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId: approval.id,
          restore: true,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Restore failed.");
        return;
      }

      setMenuOpen(false);
      await onUpdated?.();
    } catch (err: any) {
      alert(err?.message || "Restore failed.");
    }
  }

  async function deleteDraft() {
    try {
      const confirmed = window.confirm("Delete this draft approval?");
      if (!confirmed) return;

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Missing bearer token");

      const res = await fetch("/api/approvals/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId: approval.id,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json?.error || "Delete failed.");
        return;
      }

      setMenuOpen(false);
      await onUpdated?.();
    } catch (err: any) {
      alert(err?.message || "Delete failed.");
    }
  }

  return (
    <div
      style={{
        border: colors.border,
        borderLeft: colors.left,
        borderRadius: 18,
        padding: 18,
        background: colors.bg,
        boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
      }}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "nowrap",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "#2563eb",
                marginBottom: 6,
              }}
            >
              Approval Request
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {approval.title}
            </div>

            <div className="sub" style={{ opacity: 0.78, marginTop: 4 }}>
              {formatApprovalType(approval.approval_type)}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: colors.pillBorder,
                  background: colors.pillBg,
                  color: colors.pillColor,
                  whiteSpace: "nowrap",
                }}
              >
                {getStatusLabel(approval.status)}
              </div>

              {isArchived ? (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(100,116,139,0.35)",
                    background: "rgba(100,116,139,0.08)",
                    color: "#334155",
                    whiteSpace: "nowrap",
                  }}
                >
                  Archived
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              className="btn"
              onClick={() => {
                setMenuOpen(false);
                setIsOpen((v) => !v);
              }}
            >
              {isOpen ? "Hide" : "View"}
            </button>

            <div style={{ position: "relative" }} ref={menuRef}>
              <button
                className="btn"
                onClick={() => setMenuOpen((v) => !v)}
                title="Approval actions"
              >
                …
              </button>

              {menuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 44,
                    zIndex: 999,
                    width: 220,
                    maxWidth: "min(220px, 88vw)",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 14,
                    background: "white",
                    padding: 10,
                    boxShadow: "0 12px 30px rgba(15,23,42,0.10)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {isArchived ? (
                    <button className="btn" onClick={restoreApproval}>
                      Restore
                    </button>
                  ) : approval.status === "draft" ? (
                    <>
                      <button className="btn btnPrimary" onClick={sendApproval}>
                        Send Approval
                      </button>

                      <button
                        className="btn"
                        onClick={() => {
                          setMenuOpen(false);
                          onEdit?.(approval);
                        }}
                      >
                        Edit Draft
                      </button>

                      <button className="btn btnDanger" onClick={deleteDraft}>
                        Delete Draft
                      </button>
                    </>
                  ) : (
                    <button className="btn btnDanger" onClick={archiveApproval}>
                      Archive
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {isOpen ? (
          <>
            <div
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
                color: "#334155",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {approval.description}
            </div>

            {approval.cost_delta !== null || approval.schedule_delta ? (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(15,23,42,0.03)",
                  border: "1px solid rgba(15,23,42,0.06)",
                }}
              >
                {approval.cost_delta !== null ? (
                  <div className="sub" style={{ opacity: 0.85 }}>
                    <b>Cost impact:</b> {approval.cost_delta}
                  </div>
                ) : null}

                {approval.schedule_delta ? (
                  <div className="sub" style={{ opacity: 0.85 }}>
                    <b>Schedule impact:</b> {approval.schedule_delta}
                  </div>
                ) : null}
              </div>
            ) : null}

            {approval.attachments?.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.03)",
                  border: "1px solid rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>
                  Attachments
                </div>

                {approval.attachments.map((attachment: any) => {
                  if (attachment.isOffline) {
                    return (
                      <div
                        key={attachment.id}
                        style={{
                          display: "block",
                          padding: "6px 8px",
                          borderRadius: 8,
                          color: "#475569",
                          fontWeight: 600,
                          fontSize: 13,
                          background: "rgba(100,116,139,0.10)",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          whiteSpace: "normal",
                          minWidth: 0,
                          maxWidth: "100%",
                        }}
                      >
                        {attachment.filename || "Attachment"} (offline)
                      </div>
                    );
                  }

                  return (
                    <a
                      key={attachment.id}
                      href={`/api/attachments/open?id=${attachment.id}&kind=approval`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "block",
                        padding: "6px 8px",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: "#1d4ed8",
                        fontWeight: 600,
                        fontSize: 13,
                        background: "rgba(37,99,235,0.06)",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        minWidth: 0,
                        maxWidth: "100%",
                      }}
                    >
                      {attachment.filename || "Attachment"}
                    </a>
                  );
                })}F
              </div>
            ) : null}
          </>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            paddingTop: 12,
            borderTop: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div className="sub" style={{ opacity: 0.75 }}>
            Sent: {
              formatWhen(
                approval.sent_at,
                approval.created_timezone_offset_minutes
              ) || "Not sent"
            }
          </div>

          <div className="sub" style={{ opacity: 0.75 }}>
            {approval.status === "approved" || approval.status === "declined"
              ? `Responded: ${formatWhen(
                approval.responded_at,
                approval.created_timezone_offset_minutes
              ) || "—"
              }`
              : approval.status === "expired"
                ? `Expired: ${formatWhen(
                  approval.expired_at,
                  approval.created_timezone_offset_minutes
                ) || "—"
                }`
                : `Recipient: ${approval.recipient_name || approval.recipient_email}`}
          </div>
        </div>

        {isArchived ? (
          <div className="sub" style={{ opacity: 0.72 }}>
            Hidden from normal timeline view
          </div>
        ) : null}
      </div>
    </div>
  );
}