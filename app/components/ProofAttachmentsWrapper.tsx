"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import AttachmentUploader from "./AttachmentUploader";
import AttachmentList from "./AttachmentList";

type Props = {
  projectId: string;
  proofId?: number;
  offlineProofId?: string;
  lockedAt?: string | null;
  refreshKey?: number;
  onUploaded?: () => void;
};

export default function ProofAttachmentsWrapper({
  projectId,
  proofId,
  offlineProofId,
  lockedAt,
  refreshKey,
  onUploaded,
}: Props) {
  const [showUploader, setShowUploader] = useState(false);
  const [highlightUploader, setHighlightUploader] = useState(false);
  const uploaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lockedAt) setShowUploader(false);
  }, [lockedAt]);

  useEffect(() => {
    if (!showUploader) return;

    const t = setTimeout(() => {
      uploaderRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    return () => clearTimeout(t);
  }, [showUploader]);

  const helper = useMemo(() => {
    return lockedAt ? "Finalized (read-only)." : "Photos, PDFs, receipts — keep it simple.";
  }, [lockedAt]);

  function handleToggleUploader() {
    const next = !showUploader;
    setShowUploader(next);

    if (next) {
      setHighlightUploader(true);
      setTimeout(() => {
        setHighlightUploader(false);
      }, 2200);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 800 }}>Files</div>
          <div className="sub" style={{ opacity: 0.75, marginTop: 2 }}>
            {helper}
          </div>
        </div>

        <button
          className={`btn ${lockedAt ? "" : "btnPrimary"}`}
          onClick={handleToggleUploader}
          disabled={!!lockedAt}
          title={lockedAt ? "Finalized entry — uploads disabled" : "Add files to this entry"}
          style={{ marginLeft: "auto" }}
        >
          {lockedAt ? "Finalized" : showUploader ? "Hide uploader" : "Add files"}
        </button>
      </div>

      {/* Attachment List */}
      <div
        style={{
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 14,
          padding: 10,
          background: "rgba(15,23,42,0.02)",
        }}
      >
        <div key={refreshKey ?? 0}>
          {proofId ? (
            <AttachmentList proofId={proofId} lockedAt={lockedAt} />
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              Attachments will appear after sync
            </div>
          )}
        </div>
      </div>

      {/* Uploader (NOW ALWAYS AVAILABLE) */}
      {showUploader ? (
        <div
          ref={uploaderRef}
          style={{
            border: highlightUploader
              ? "2px solid rgba(37,99,235,0.45)"
              : "1px solid rgba(15,23,42,0.08)",
            borderRadius: 14,
            padding: 10,
            background: "#fff",
            boxShadow: highlightUploader
              ? "0 0 0 6px rgba(59,130,246,0.12)"
              : undefined,
            transition: "all 0.25s ease",
          }}
        >
          <AttachmentUploader
            projectId={projectId}
            proofId={proofId}
            offlineProofId={offlineProofId}
            lockedAt={lockedAt}
            onUploaded={() => {
              onUploaded?.();
            }}
          />

          <div className="sub" style={{ marginTop: 8, opacity: 0.65 }}>
            Tip: upload a few key photos + any receipts. Then send the project update.
          </div>
        </div>
      ) : null}
    </div>
  );
}