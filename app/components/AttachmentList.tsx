"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  loadCachedAttachments,
  saveCachedAttachments,
} from "../../lib/offlineAttachmentCache";
type Attachment = {
  id: string;
  proof_id: number;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  path: string;
};

type Props = {
  proofId: number;
  lockedAt?: string | null;
};

function getAttachmentCacheKey(proofId: number) {
  return `buildproof_attachment_cache_${proofId}`;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatWhenShort(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fileKind(mime?: string | null) {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("zip")) return "zip";
  if (m.includes("msword") || m.includes("officedocument")) return "doc";
  return "file";
}

function fileIcon(kind: string) {
  if (kind === "image") return "🖼️";
  if (kind === "pdf") return "📄";
  if (kind === "zip") return "🗜️";
  if (kind === "doc") return "📝";
  return "📎";
}

export default function AttachmentList({ proofId, lockedAt }: Props) {
  const [loading, setLoading] = useState(true);
const [attachments, setAttachments] = useState<Attachment[]>(() =>
  loadCachedAttachments(proofId) as Attachment[]
);
const [error, setError] = useState("");
const [busyId, setBusyId] = useState("");
const [isMobile, setIsMobile] = useState(false);

  const isLocked = !!lockedAt;

    async function load() {
    setError("");

    const cached = loadCachedAttachments(proofId) as Attachment[];
    const hasCachedAttachments = cached.length > 0;

    if (hasCachedAttachments) {
      setAttachments(cached);
    }

    setLoading(!hasCachedAttachments);

    const { data, error } = await supabase
      .from("attachments")
      .select("id, proof_id, filename, mime_type, size_bytes, created_at, path")
      .eq("proof_id", proofId)
      .order("created_at", { ascending: false });

    if (error) {
      const message = String(error.message || "").toLowerCase();

      const looksOffline =
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("fetch");

      if (looksOffline) {
        setLoading(false);
        return;
      }

      setError(error.message);
      setLoading(false);
      return;
    }

    const nextAttachments = (data as Attachment[]) ?? [];
    setAttachments(nextAttachments);
    saveCachedAttachments(proofId, nextAttachments);
    setLoading(false);
  }

  useEffect(() => {
    load();

    function handleAttachmentComplete() {
      load();
    }

    function handleOnline() {
      load();
    }

    function handleFocus() {
      load();
    }

    window.addEventListener("buildproof-attachment-complete", handleAttachmentComplete as EventListener);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener(
        "buildproof-attachment-complete",
        handleAttachmentComplete as EventListener
      );
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofId]);

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 640);
    }

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  async function openAttachment(a: Attachment) {
    setError("");
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(a.path, 60);
    if (error) return setError(error.message);
    if (!data?.signedUrl) return setError("Could not create signed URL");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteAttachment(a: Attachment) {
    const ok = window.confirm(`Remove "${a.filename}"? This cannot be undone.`);
    if (!ok) return;

    setError("");
    setBusyId(a.id);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/attachments/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ attachmentId: a.id }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Remove failed");

      setAttachments((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e: any) {
      setError(e?.message ?? "Remove failed");
    } finally {
      setBusyId("");
    }
  }

  const emptyText = useMemo(() => {
    if (loading) return "";
    if (attachments.length === 0) return "No files yet.";
    return "";
  }, [loading, attachments.length]);

  if (loading) {
    return (
      <div className="sub" style={{ opacity: 0.8 }}>
        Loading files…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error ? (
        <div className="notice" style={{ margin: 0 }}>
          Error: {error}
        </div>
      ) : null}

      {emptyText ? (
        <div className="sub" style={{ opacity: 0.75 }}>
          {emptyText}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          {attachments.map((a) => {
            const busy = busyId === a.id;
            const kind = fileKind(a.mime_type);
            const icon = fileIcon(kind);
            const metaParts = [
              a.mime_type ?? "unknown",
              formatBytes(a.size_bytes),
              a.created_at ? formatWhenShort(a.created_at) : "",
            ].filter(Boolean);

            const compactImageMetaParts = [
              formatBytes(a.size_bytes),
              a.created_at ? formatWhenShort(a.created_at) : "",
            ].filter(Boolean);

            if (isMobile) {
              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid rgba(15,23,42,0.08)",
                    borderRadius: 12,
                    padding: 8,
                    background: "#fff",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: kind === "image" ? "84px minmax(0,1fr)" : "1fr auto",
                      gap: 8,
                      alignItems: "start",
                    }}
                  >
                    {kind === "image" ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isLocked ? "84px minmax(0,1fr)" : "84px minmax(0,1fr) auto",
                          gap: 8,
                          alignItems: "center",
                          minWidth: 0,
                          gridColumn: "1 / -1",
                        }}
                      >
                        <ImagePreview path={a.path} filename={a.filename} mobile />

                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              lineHeight: 1.2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={a.filename}
                          >
                            {a.filename}
                          </div>

                          <div
                            className="sub"
                            style={{
                              opacity: 0.72,
                              lineHeight: 1.2,
                              fontSize: 12,
                              marginTop: 2,
                              wordBreak: "break-word",
                            }}
                          >
                            {compactImageMetaParts.join(" • ")}
                          </div>
                        </div>

                        {!isLocked ? (
                          <button
                            onClick={() => deleteAttachment(a)}
                            disabled={busy}
                            style={{
                              border: "1px solid rgba(239,68,68,0.18)",
                              background: "rgba(239,68,68,0.06)",
                              color: "#dc2626",
                              borderRadius: 999,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              lineHeight: 1.1,
                              whiteSpace: "nowrap",
                              cursor: busy ? "default" : "pointer",
                              opacity: busy ? 0.7 : 1,
                              alignSelf: "center",
                            }}
                          >
                            {busy ? "Removing..." : "Remove"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                          }}
                        >
                          <div style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                            title={a.filename}
                          >
                            {a.filename}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "flex-start",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={() => openAttachment(a)}
                            disabled={busy}
                            style={{
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: "#fff",
                              color: "#0f172a",
                              borderRadius: 999,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              lineHeight: 1.1,
                              whiteSpace: "nowrap",
                              cursor: busy ? "default" : "pointer",
                              opacity: busy ? 0.7 : 1,
                            }}
                          >
                            Open
                          </button>

                          {!isLocked ? (
                            <button
                              onClick={() => deleteAttachment(a)}
                              disabled={busy}
                              style={{
                                border: "1px solid rgba(239,68,68,0.18)",
                                background: "rgba(239,68,68,0.06)",
                                color: "#dc2626",
                                borderRadius: 999,
                                padding: "6px 10px",
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: 1.1,
                                whiteSpace: "nowrap",
                                cursor: busy ? "default" : "pointer",
                                opacity: busy ? 0.7 : 1,
                              }}
                            >
                              {busy ? "Removing..." : "Remove"}
                            </button>
                          ) : null}
                        </div>

                        <div style={{ minWidth: 0, gridColumn: "1 / -1" }}>
                          <div
                            className="sub"
                            style={{
                              opacity: 0.72,
                              lineHeight: 1.25,
                              wordBreak: "break-word",
                              fontSize: 12,
                            }}
                          >
                            {metaParts.join(" • ")}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={a.id}
                style={{
                  border: "1px solid rgba(15,23,42,0.08)",
                  borderRadius: 14,
                  padding: 10,
                  background: "#fff",
                  display: "grid",
                  gridTemplateColumns: kind === "image" ? "120px minmax(0,1fr) auto" : "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {kind === "image" ? <ImagePreview path={a.path} filename={a.filename} /> : null}

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{icon}</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 750,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                      title={a.filename}
                    >
                      {a.filename}
                    </div>
                  </div>

                  <div className="sub" style={{ opacity: 0.75, lineHeight: 1.35 }}>
                    {metaParts.join(" • ")}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {kind !== "image" ? (
                    <button className="btn" onClick={() => openAttachment(a)} disabled={busy}>
                      Open
                    </button>
                  ) : null}

                  {!isLocked ? (
                    <button
                      onClick={() => deleteAttachment(a)}
                      disabled={busy}
                      style={{
                        border: "1px solid rgba(239,68,68,0.18)",
                        background: "rgba(239,68,68,0.06)",
                        color: "#dc2626",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                        cursor: busy ? "default" : "pointer",
                        opacity: busy ? 0.7 : 1,
                      }}
                    >
                      {busy ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ImagePreview({
  path,
  filename,
  mobile = false,
}: {
  path: string;
  filename: string;
  mobile?: boolean;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      const { data } = await supabase.storage.from("attachments").createSignedUrl(path, 60);
      if (!alive) return;
      setUrl(data?.signedUrl ?? "");
    }

    run();
    return () => {
      alive = false;
    };
  }, [path]);

  if (!url) return null;

  return (
    <button
      type="button"
      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        margin: 0,
        width: "fit-content",
        cursor: "pointer",
      }}
      title={`Open ${filename}`}
    >
      <img
        src={url}
        alt={filename}
        style={{
          display: "block",
          width: mobile ? "84px" : "120px",
          height: mobile ? "64px" : "90px",
          objectFit: "cover",
          borderRadius: 12,
          border: "1px solid rgba(15,23,42,0.08)",
          background: "rgba(15,23,42,0.02)",
        }}
      />
    </button>
  );
}