"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (fields: {
    title: string;
    address: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
  }) => void | Promise<void>;
};

// Phase 7 (Supporting Screens): New Project modal, matching the mockup
// Ryan shared -- a real overlay (not inline in the page), minimal required
// fields, everything else optional and addable later. Built theme-aware
// (var(--...) tokens, no hardcoded colors) from the start, per the Dark
// Mode / Theme System initiative's plan to build new/restructured Phase 7
// pieces theme-aware rather than migrating them a second time.
export default function NewProjectModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setAddress("");
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setSubmitting(false);

      setTimeout(() => {
        document.getElementById("new-project-modal-title")?.focus();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = title.trim().length > 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;

    setSubmitting(true);

    try {
      await onCreate({
        title: title.trim(),
        address: address.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New record"
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
          maxWidth: 420,
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
          <div style={{ fontWeight: 800, fontSize: 17 }}>New record</div>
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

        <div style={{ display: "grid", gap: 6 }}>
          <label className="sub" style={{ fontWeight: 700, opacity: 0.85 }}>
            Record name
          </label>
          <input
            id="new-project-modal-title"
            className="input"
            placeholder="123 Oak Street"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="sub" style={{ fontWeight: 700, opacity: 0.85 }}>
            Address (optional)
          </label>
          <input
            className="input"
            placeholder="Street, city, state"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div style={{ borderTop: "1px solid var(--borderSoft)", paddingTop: 14, display: "grid", gap: 10 }}>
          <div className="sub" style={{ fontWeight: 700, opacity: 0.85 }}>
            Client <span style={{ fontWeight: 400, opacity: 0.75 }}>(optional — add now or later)</span>
          </div>

          <input
            className="input"
            placeholder="Client name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />

          <input
            className="input"
            placeholder="Client email"
            type="email"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />

          <input
            className="input"
            placeholder="Client phone"
            type="tel"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
          />
        </div>

        <div className="notice">
          You can add an estimate, client details, and photos once the record's created.
        </div>

        <button
          className="btn btnPrimary"
          disabled={!canSubmit}
          onClick={handleCreate}
          style={{ width: "100%", fontWeight: 800, padding: "14px 12px" }}
        >
          {submitting ? "Creating..." : "Create record"}
        </button>
      </div>
    </div>
  );
}
