"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type BulkCaptionItem = {
  key: string;
  file: File;
  caption: string;
  previewUrl?: string; // for images
  isPdf: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;

  // Step 1: just return selected items (we’ll upload in Step 2)
  onSave: (items: BulkCaptionItem[]) => void;
};

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export default function BulkCaptionUploader({ open, onClose, onSave }: Props) {
  const [items, setItems] = useState<BulkCaptionItem[]>([]);
  const [status, setStatus] = useState<string>("");

  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const captionRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const count = useMemo(() => items.length, [items]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When closing, reset items
  useEffect(() => {
    if (!open) {
      // revoke previews
      items.forEach((it) => {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      });
      setItems([]);
      setStatus("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const incoming: BulkCaptionItem[] = Array.from(files).map((file) => {
      const pdf = isPdf(file);
      return {
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        caption: "",
        previewUrl: pdf ? undefined : URL.createObjectURL(file),
        isPdf: pdf,
      };
    });

    // Newest first (matches your timeline)
    setItems((prev) => [...incoming.reverse(), ...prev]);
    setStatus("");

    // Focus first caption after adding
    setTimeout(() => {
      const first = incoming[incoming.length - 1]; // because we reversed
      if (first) captionRefs.current[first.key]?.focus();
    }, 80);

    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const it = prev.find((x) => x.key === key);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((x) => x.key !== key);
    });
  }

  function updateCaption(key: string, caption: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, caption } : it)));
  }

  function handleSave() {
    if (items.length === 0) {
      setStatus("Add at least one photo first.");
      return;
    }
    onSave(items);
  }

  function onCaptionKeyDown(e: React.KeyboardEvent<HTMLInputElement>, currentKey: string) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const keys = items.map((i) => i.key);
    const idx = keys.indexOf(currentKey);
    const nextKey = keys[idx + 1];
    if (nextKey) {
      captionRefs.current[nextKey]?.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: 14,
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(900px, 100%)",
          marginTop: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row">
          <div style={{ fontWeight: 850 }}>Add to Project Journal</div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="sub" style={{ marginTop: 6, opacity: 0.8 }}>
          Tip: add a short caption so your client knows what they’re seeing. (Captions optional)
        </div>

        <hr className="hr" />

        {/* Pick from gallery (multi-select) */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            ref={galleryInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="sub" style={{ opacity: 0.75 }}>
            Selected: <b>{count}</b>
          </div>
        </div>

        {status ? (
          <div className="sub" style={{ marginTop: 8 }}>
            {status}
          </div>
        ) : null}

        {/* List */}
        {items.length > 0 ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {items.map((it) => (
              <div
                key={it.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(0,0,0,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.03)",
                  }}
                >
                  {it.isPdf ? (
                    <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.75 }}>PDF</div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.previewUrl}
                      alt={it.file.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={it.file.name}
                  >
                    {it.file.name}
                  </div>

                  <input
                    ref={(el) => {
                      captionRefs.current[it.key] = el;
                    }}
                    className="input"
                    placeholder="Caption (optional)"
                    value={it.caption}
                    onChange={(e) => updateCaption(it.key, e.target.value)}
                    onKeyDown={(e) => onCaptionKeyDown(e, it.key)}
                    style={{ marginTop: 8 }}
                  />

                  <div className="sub" style={{ marginTop: 6, opacity: 0.7 }}>
                    {Math.round(it.file.size / 1024)} KB
                  </div>
                </div>

                <button className="btn btnDanger" onClick={() => removeItem(it.key)} title="Remove">
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 14, opacity: 0.75 }} className="sub">
            Choose photos (or PDFs) and add quick captions. Then hit <b>Save Entries</b>.
          </div>
        )}

        <hr className="hr" />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btnPrimary" onClick={handleSave} disabled={items.length === 0}>
            Save Entries
          </button>
        </div>
      </div>
    </div>
  );
}
