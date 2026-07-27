"use client";

import { useEffect } from "react";
import SendUpdatePack from "./SendUpdatePack";
import DeliveryHistoryPanel from "./DeliveryHistoryPanel";

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  entryCount: number;
  archivedEntryCount: number;
  showDeliveryHistory: boolean;
  onToggleDeliveryHistory: () => void;
  onSendSuccess: () => void;
};

// Phase 7 (Supporting Screens): Send Update modal, matching the mockup Ryan
// shared -- a real overlay (dimmed backdrop, centered card, close X, Escape
// to close, click-outside-to-close), not inline-in-page like it was before.
// Wraps the existing SendUpdatePack (all send/share/offline-queue logic
// untouched) plus the Delivery History toggle/panel that used to live
// alongside it in the Timeline tab. Built theme-aware (var(--...) tokens
// only), matching NewProjectModal.tsx's established dialog pattern.
export default function SendUpdateModal({
  open,
  onClose,
  projectId,
  projectTitle,
  clientName,
  clientEmail,
  clientPhone,
  entryCount,
  archivedEntryCount,
  showDeliveryHistory,
  onToggleDeliveryHistory,
  onSendSuccess,
}: Props) {
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send update"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 12,
            borderBottom: "1px solid var(--borderSoft)",
          }}
        >
          <div style={{ width: 32 }} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>
            Send update{projectTitle ? ` — ${projectTitle}` : ""}
          </div>
          <button
            className="btn"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn"
            onClick={onToggleDeliveryHistory}
            title="Show or hide delivery history"
            style={{ maxWidth: "100%", whiteSpace: "normal", textAlign: "center" }}
          >
            {showDeliveryHistory ? "Hide Delivery History" : "Show Delivery History"}
          </button>
        </div>

        {showDeliveryHistory ? (
          <DeliveryHistoryPanel projectId={projectId} />
        ) : null}

        <SendUpdatePack
          projectId={projectId}
          projectTitle={projectTitle}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          entryCount={entryCount}
          archivedEntryCount={archivedEntryCount}
          onSendSuccess={onSendSuccess}
        />
      </div>
    </div>
  );
}
