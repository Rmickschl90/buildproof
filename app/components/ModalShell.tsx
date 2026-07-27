"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: number;
  children: ReactNode;
};

// Shared modal chrome (2026-07-27): dimmed backdrop, centered card, X close
// button top-right, Escape-to-close, click-outside-to-close -- extracted from
// the pattern SendUpdateModal.tsx and NewProjectModal.tsx already established
// (Phase 7), so the Estimate composer and Add Entry composer can be converted
// to real popup screens too instead of inline sections toggled by a header
// "Exit X" text button. Ryan, 2026-07-27: "separate screens that pop up with
// cancel and X in the corner to exit" -- this owns the X; each screen adds
// its own Cancel button since their save/discard semantics differ slightly
// (e.g. drafts persist locally until explicitly sent).
export default function ModalShell({
  open,
  onClose,
  title,
  maxWidth = 460,
  children,
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
      aria-label={title}
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
          maxWidth,
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
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
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

        {children}
      </div>
    </div>
  );
}
