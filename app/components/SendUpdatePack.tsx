"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  createOfflineSendRecord,
  createSendIdempotencyKey,
  removeOfflineSendRecord,
  getAllOfflineSendRecords,
} from "@/lib/offlineSendOutbox";
import { flushOfflineSendOutbox } from "@/lib/offlineSendFlush";
import { getSendStatusLabel, type SendUiStatus } from "@/lib/sendStatus";
import SendDiagnosticsPanel from "@/app/components/SendDiagnosticsPanel";

type Props = {
  projectId: string;
  projectTitle?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  entryCount?: number;
  archivedEntryCount?: number;
  onSendSuccess?: () => void;
};

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

const ACTIVE_JOB_KEY_PREFIX = "buildproof-active-send-job:";

export default function SendUpdatePack({
  projectId,
  projectTitle,
  clientName,
  clientEmail,
  clientPhone,
  entryCount = 0,
  archivedEntryCount = 0,
  onSendSuccess,
}: Props) {
  const router = useRouter();

  const [status, setStatus] = useState("");
  const [sendUiStatus, setSendUiStatus] = useState<SendUiStatus>("idle");
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [hasActiveShare, setHasActiveShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [toEmail, setToEmail] = useState(clientEmail ?? "");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [archivedCount, setArchivedCount] = useState(archivedEntryCount);
  const [sending, setSending] = useState(false);
  const [workingLink, setWorkingLink] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [failedJobId, setFailedJobId] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<StatusSummary>({
    latestJob: null,
    latestDelivery: null,
  });

  const resumingRef = useRef(false);
  const mountedRef = useRef(true);
  const justRevokedRef = useRef(false);
  const statusRef = useRef<HTMLDivElement | null>(null);

  const hasDraftEntries = entryCount > 0;
  const hasArchivedEntries = archivedCount > 0;
  const hasOfficialClientEmail = (clientEmail ?? "").trim().length > 3;
  const officialEmail = (clientEmail ?? "").trim().toLowerCase();
  const hasSendableEntries =
    hasDraftEntries || (includeArchived && hasArchivedEntries);

  const isBusy =
    sending ||
    sendUiStatus === "saving_intent" ||
    sendUiStatus === "creating_job" ||
    sendUiStatus === "sending_job" ||
    sendUiStatus === "finalizing_entries";

  const canSend =
    hasOfficialClientEmail &&
    hasSendableEntries &&
    !isBusy &&
    !activeJobId;

  function setUiStatus(next: SendUiStatus, message?: string) {
    if (!mountedRef.current) return;
    setSendUiStatus(next);
    setStatus(message ?? getSendStatusLabel(next));
  }

  function activeJobStorageKey() {
    return `${ACTIVE_JOB_KEY_PREFIX}${projectId}`;
  }

  function saveActiveJobId(jobId: string) {
    try {
      window.localStorage.setItem(activeJobStorageKey(), jobId);
    } catch { }
  }

  function clearActiveJobId() {
    try {
      window.localStorage.removeItem(activeJobStorageKey());
    } catch { }
  }

  function getSavedActiveJobId() {
    try {
      return window.localStorage.getItem(activeJobStorageKey());
    } catch {
      return null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setToEmail(clientEmail ?? "");
  }, [clientEmail]);

  useEffect(() => {
    async function loadArchivedCount() {
      const { count } = await supabase
        .from("proofs")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .not("deleted_at", "is", null);

      if (typeof count === "number" && mountedRef.current) {
        setArchivedCount(count);
      }
    }

    loadArchivedCount();
  }, [projectId]);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("Not logged in");

    return token;
  }

  async function loadLatestFailedJob() {
    try {
      const token = await getAccessToken();

      const res = await fetch(
        `/api/send/latest-failed-job?projectId=${projectId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await res.json().catch(() => ({}));

      if (mountedRef.current) {
        setFailedJobId(json?.job?.id ? String(json.job.id) : null);
      }
    } catch {
      if (mountedRef.current) {
        setFailedJobId(null);
      }
    }
  }

  async function loadStatusSummary() {
    try {
      const token = await getAccessToken();

      const res = await fetch(`/api/send/status-summary?projectId=${projectId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) return;

      if (mountedRef.current) {
        setStatusSummary({
          latestJob: json?.latestJob ?? null,
          latestDelivery: json?.latestDelivery ?? null,
        });


      }
    } catch {
      // ignore
    }
  }

  async function refreshSendMeta() {
    await Promise.all([loadLatestFailedJob(), loadStatusSummary(), loadCurrentShare()]);
  }

  async function refreshSendMetaWithoutShare() {
    await Promise.all([loadLatestFailedJob(), loadStatusSummary()]);
  }

  async function loadCurrentShare() {
    try {
      if (justRevokedRef.current) {
        if (mountedRef.current) {
          setShareId(null);
          setShareUrl("");
          setHasActiveShare(false);
          setShareCopied(false);
        }
        return;
      }

      const token = await getAccessToken();

      const res = await fetch(`/api/share/current?projectId=${projectId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;

      if (!mountedRef.current) return;

      const rawUrl =
        json?.share?.shareUrl ||
        json?.shareUrl ||
        null;

      const nextShareId =
        json?.share?.id ||
        json?.id ||
        null;

      if (rawUrl) {
        const raw = String(rawUrl);
        const full = raw.startsWith("http")
          ? raw
          : `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}${raw}`;

        setShareId(nextShareId ? String(nextShareId) : null);
        setShareUrl(full);
        setHasActiveShare(true);
        setShareCopied(true); // existing active link should show Revoke
      } else {
        setShareId(null);
        setShareUrl("");
        setHasActiveShare(false);
        setShareCopied(false);
      }
    } catch {
      // ignore
    }
  }

  async function ensureShareLink(): Promise<string> {
    if (shareUrl && shareId) {
      justRevokedRef.current = false;
      return shareUrl;
    }

    setWorkingLink(true);
    setStatus("Creating link.");

    try {
      justRevokedRef.current = false;

      const token = await getAccessToken();

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Create share failed");

      const rawUrl =
        json?.share?.shareUrl ||
        json?.shareUrl ||
        null;

      const nextShareId =
        json?.share?.id ||
        json?.id ||
        null;

      if (!rawUrl) {
        throw new Error("Create share failed");
      }

      const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const full = String(rawUrl).startsWith("http")
        ? String(rawUrl)
        : `${base}${rawUrl}`;

      if (mountedRef.current) {
        setShareId(nextShareId ? String(nextShareId) : null);
        setShareUrl(full);
        setHasActiveShare(true);
        setShareCopied(false);
        setStatus("Link ready");
      }

      console.log("[SendUpdatePack] manual share created", {
        shareId: nextShareId ? String(nextShareId) : null,
        shareUrl: full,
      });

      return full;
    } finally {
      if (mountedRef.current) {
        setWorkingLink(false);
      }
    }
  }

  async function copyLink() {
    try {
      const link = shareUrl.trim();

      if (!link) {
        throw new Error("Link not ready");
      }

      try {
        await navigator.clipboard.writeText(link);
      } catch {
        const textarea = document.createElement("textarea");
        textarea.value = link;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!ok) {
          throw new Error("Copy failed");
        }
      }

      if (mountedRef.current) {
        justRevokedRef.current = false;
        setHasActiveShare(true);
        setShareCopied(true);
        setStatus("Copied link");
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setStatus(e?.message ?? "Copy failed");
      }
    }
  }

  async function createLinkOnly() {
    console.log("[SendUpdatePack] createLinkOnly clicked");

    try {
      justRevokedRef.current = false;

      const link = await ensureShareLink();

      if (mountedRef.current) {
        setShareUrl(link);
        setHasActiveShare(true);
        setShareCopied(false);
        setStatus("Link created");
      }
    } catch (e: any) {
      console.error("[SendUpdatePack] createLinkOnly failed", e);
      if (mountedRef.current) {
        setStatus(e?.message ?? "Create link failed");
      }
    }
  }

  async function revokeLink() {
    if (!shareId) {
      setStatus("No active manual share link to revoke.");
      return;
    }

    const ok = window.confirm("Revoke share link?");
    if (!ok) return;

    try {
      setWorkingLink(true);
      setStatus("Revoking link.");

      console.log("[SendUpdatePack] revokeLink using shareId", shareId);

      const token = await getAccessToken();

      const res = await fetch("/api/share/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shareId, projectId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Revoke failed");

      if (mountedRef.current) {
        justRevokedRef.current = true;
        setShareId(null);
        setShareUrl("");
        setHasActiveShare(false);
        setShareCopied(false);
        setStatus("Link revoked");
      }
    } catch (e: any) {
      if (mountedRef.current) {
        justRevokedRef.current = false;
        setStatus(e?.message ?? "Revoke failed");
      }
    } finally {
      if (mountedRef.current) {
        setWorkingLink(false);
      }
    }
  }

  async function resumeSendJob(jobId: string, token: string) {
    if (resumingRef.current) return;
    resumingRef.current = true;

    try {
      if (mountedRef.current) {
        setSending(true);
        setActiveJobId(jobId);
        setUiStatus("sending_job");
      }

      saveActiveJobId(jobId);

      let done = false;

      while (!done && mountedRef.current) {
        try {
          const processRes = await fetch("/api/send/process-job", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ jobId }),
          });

          const processJson = await processRes.json().catch(() => ({}));

          if (!processRes.ok && processRes.status !== 202) {
            throw new Error(processJson?.error || "Failed to process send job");
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));

          const statusRes = await fetch(`/api/send/job-status?id=${jobId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const statusJson = await statusRes.json().catch(() => ({}));

          if (!statusRes.ok) {
            throw new Error(statusJson?.error || "Failed to read send status");
          }

          const job = statusJson?.job;
          const jobStatus = job?.status;

          // Do not overwrite the manual dashboard share link with a send-created link.
          // Sent update links are tracked on the job, but the dashboard share controls
          // should continue to point at the reusable manual share link.

          if (jobStatus === "pending") {
            if (mountedRef.current) {
              setUiStatus("creating_job", "Preparing update...");
            }
          } else if (jobStatus === "processing") {
            if (mountedRef.current) {
              setUiStatus("sending_job", "Sending update...");
            }
          } else if (jobStatus === "retrying") {
            if (mountedRef.current) {
              setUiStatus(
                "sending_job",
                "Connection unstable — retrying send..."
              );
            }
          } else if (jobStatus === "sent") {
            if (mountedRef.current) {
              setUiStatus("finalizing_entries", "Finalizing entries...");
            }

            try {
              const records = await getAllOfflineSendRecords();

              for (const record of records) {
                if (record.projectId === projectId) {
                  await removeOfflineSendRecord(record.id);
                }
              }
            } catch {
              // ignore cleanup failure
            }

            await refreshSendMetaWithoutShare();

            if (mountedRef.current) {
              setUiStatus("sent", "Update sent");
              setSending(false);
              setActiveJobId(null);
              setFailedJobId(null);
            }

            clearActiveJobId();
            onSendSuccess?.();
            window.dispatchEvent(new Event("buildproof-send-complete"));
            router.refresh();
            done = true;
          } else if (jobStatus === "failed") {
            clearActiveJobId();
            throw new Error(job?.last_error || "Send failed");
          }
        } catch (loopError: any) {
          const msg = String(loopError?.message || "");

          if (
            msg.toLowerCase().includes("failed to fetch") ||
            msg.toLowerCase().includes("networkerror") ||
            !navigator.onLine
          ) {
            if (mountedRef.current) {
              setUiStatus(
                "queued_offline",
                "Connection lost — your send was saved and will resume automatically when you're back online."
              );
              setSending(false);
            }
            done = true;
            break;
          }

          throw loopError;
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || "Send failed");

      if (
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("networkerror") ||
        !navigator.onLine
      ) {
        if (mountedRef.current) {
          setUiStatus(
            "queued_offline",
            "Connection lost — your send was saved and will resume automatically when you're back online."
          );
        }
      } else {
        if (mountedRef.current) {
          setUiStatus("failed", msg);
        }
      }

      if (mountedRef.current) {
        setSending(false);
      }

      await refreshSendMetaWithoutShare();
    } finally {
      resumingRef.current = false;
    }
  }

  async function tryResumeAnyActiveJob(reason: string) {
    if (resumingRef.current) return;

    try {
      const token = await getAccessToken();

      const res = await fetch(`/api/send/active-job?projectId=${projectId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));
      let job = json?.job ?? null;

      if (!job?.id) {
        const savedJobId = getSavedActiveJobId();
        if (savedJobId) {
          const statusRes = await fetch(`/api/send/job-status?id=${savedJobId}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const statusJson = await statusRes.json().catch(() => ({}));
          const savedJob = statusJson?.job;

          if (
            statusRes.ok &&
            savedJob &&
            ["pending", "processing", "retrying"].includes(
              String(savedJob.status || "")
            )
          ) {
            job = savedJob;
          }
        }
      }

      if (!job?.id) return;

      if (mountedRef.current) {
        if (reason === "online") {
          setUiStatus("sending_job", "Connection restored — resuming send...");
        } else if (reason === "load") {
          setUiStatus("sending_job", "Resuming send...");
        } else {
          setUiStatus("sending_job", "Sending update...");
        }

        setActiveJobId(String(job.id));
        setSending(true);
      }

      await resumeSendJob(String(job.id), token);
    } catch {
      // ignore and let the next poll try again
    }
  }

  async function sendProjectUpdate() {
    if (!hasOfficialClientEmail) {
      setStatus("Add a client email to enable official project updates.");
      return;
    }

    try {
      setSending(true);

      // 🔴 STEP 2 FIX: check for existing active job BEFORE creating new one
      const token = await getAccessToken();

      const activeRes = await fetch(`/api/send/active-job?projectId=${projectId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const activeJson = await activeRes.json().catch(() => ({}));
      const existingJob = activeJson?.job;

      if (existingJob?.id) {
        // 🔴 DO NOT CREATE NEW JOB — resume existing
        setStatus("Resuming existing send...");
        await resumeSendJob(String(existingJob.id), token);
        return;
      }

      setUiStatus("saving_intent");

      const idempotencyKey = createSendIdempotencyKey();

      await createOfflineSendRecord({
        projectId,
        toEmail: officialEmail,
        includeArchived,
        idempotencyKey,
      });

      if (navigator.onLine) {
        setUiStatus("creating_job", "Preparing send...");
        await flushOfflineSendOutbox({
          getAccessToken,
          onStatus: (nextStatus, meta) => {
            setUiStatus(nextStatus, meta?.message);
          },
        });
        await refreshSendMetaWithoutShare();
        await tryResumeAnyActiveJob("send");

        if (mountedRef.current) {
          setSending(false);
        }
      } else {
        setUiStatus(
          "queued_offline",
          "Update saved — will send automatically when connection returns."
        );
        setSending(false);
      }
    } catch (e: any) {
      setUiStatus("failed", e?.message || "Failed to queue send");
      setSending(false);
    }
  }

  async function retryFailedSend() {
    if (!failedJobId) return;

    try {
      const token = await getAccessToken();

      const { error } = await supabase
        .from("send_jobs")
        .update({
          status: "retrying",
          last_error: null,
          last_error_at: null,
          next_retry_at: new Date().toISOString(),
        })
        .eq("id", failedJobId);

      if (error) throw error;

      if (mountedRef.current) {
        setUiStatus("sending_job", "Retrying failed send...");
        setFailedJobId(null);
      }

      saveActiveJobId(failedJobId);
      await resumeSendJob(failedJobId, token);
    } catch (e: any) {
      if (mountedRef.current) {
        setUiStatus("failed", e?.message || "Failed to retry send");
      }
    }
  }

  useEffect(() => {
    if (!statusRef.current) return;

    statusRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [status]);

  useEffect(() => {
    refreshSendMeta();
    tryResumeAnyActiveJob("load");

    const intervalMs =
      activeJobId || failedJobId || isBusy ? 5000 : 30000;

    const interval = window.setInterval(() => {
      refreshSendMetaWithoutShare();

      if (activeJobId || isBusy) {
        tryResumeAnyActiveJob("poll");
      }
    }, intervalMs);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeJobId, failedJobId, isBusy]);

  useEffect(() => {
    function handleFocus() {
      refreshSendMeta();
      tryResumeAnyActiveJob("focus");
    }

    function handleVisible() {
      if (document.visibilityState === "visible") {
        refreshSendMetaWithoutShare();
        tryResumeAnyActiveJob("visible");
      }
    }

    async function handleOnline() {
      refreshSendMetaWithoutShare();
      await tryResumeAnyActiveJob("online");
    }

    async function handleSendComplete() {
      await flushOfflineSendOutbox({
        getAccessToken,
      });

      await refreshSendMetaWithoutShare();
      await loadCurrentShare();

      if (!mountedRef.current) return;

      clearActiveJobId();
      setActiveJobId(null);
      setFailedJobId(null);
      setSending(false);
      setUiStatus("sent", "Update sent");
    }

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("online", handleOnline);
    window.addEventListener("buildproof-send-complete", handleSendComplete);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("buildproof-send-complete", handleSendComplete);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {status ? (
        <div
          ref={statusRef}
          className="sub"
          style={{ opacity: 0.85 }}
        >
          {status}
        </div>
      ) : null}

      <div
        className="card"
        style={{
          display: "grid",
          gap: 14,
          padding: 18,
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 16,
          background: "#fff",
          boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 8,
            padding: "14px 14px",
            borderRadius: 14,
            border: "1px solid rgba(59,130,246,0.14)",
            background: "rgba(239,246,255,0.9)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: "#1d4ed8",
              opacity: 0.9,
            }}
          >
            Update Summary
          </div>

          <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.35 }}>
            Includes {entryCount} draft entr{entryCount === 1 ? "y" : "ies"} that will be finalized when sent.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "rgba(15,23,42,0.02)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              opacity: 0.6,
            }}
          >
            Official Delivery Email
          </div>

          <input
            className="input"
            placeholder="Add client email in project settings"
            value={toEmail}
            readOnly
            disabled
          />

          {!hasOfficialClientEmail ? (
            <div className="sub" style={{ opacity: 0.8, color: "#b45309", fontWeight: 700 }}>
              Add client email to enable official updates. Until then, BuildProof can still be used for journaling and PDF exports.
            </div>
          ) : (
            <div className="sub" style={{ opacity: 0.75 }}>
              This project’s saved client email is the official delivery address for future updates.
            </div>
          )}

          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              opacity: isBusy ? 0.7 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              disabled={isBusy}
            />
            Include archived entries
          </label>

          {!hasSendableEntries ? (
            <div
              className="sub"
              style={{
                color: "#b45309",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {hasArchivedEntries
                ? 'No draft entries to send. Check "Include archived entries" to send archived entries only.'
                : "No draft entries to send."}
            </div>
          ) : null}

          <button
            className="btn"
            disabled={!canSend}
            onClick={sendProjectUpdate}
            style={{
              width: "100%",
              background: canSend ? "#16a34a" : undefined,
              color: canSend ? "white" : undefined,
              fontWeight: 800,
              borderColor: canSend ? "#16a34a" : undefined,
            }}
          >
            {activeJobId && !isBusy
              ? "Send In Progress"
              : isBusy
                ? getSendStatusLabel(sendUiStatus) || "Sending..."
                : hasOfficialClientEmail
                  ? "Send Project Update"
                  : "Add Client Email to Send Updates"}
          </button>

          {failedJobId && !isBusy && hasOfficialClientEmail ? (
            <button className="btn" onClick={retryFailedSend}>
              Retry Failed Send
            </button>
          ) : null}

          {activeJobId ? (
            <div className="sub" style={{ opacity: 0.75, fontSize: 12, fontWeight: 700 }}>
              A send is already in progress for this project. Wait for it to finish or resume.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "#fff",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              opacity: 0.6,
            }}
          >
            Delivery Status
          </div>

          <div className="sub" style={{ opacity: 0.85 }}>
            Queue: {statusSummary.latestJob?.status || "No recent send"}
          </div>

          <div className="sub" style={{ opacity: 0.85 }}>
            Email: {statusSummary.latestDelivery?.status || "No recent email"}
          </div>

          {statusSummary.latestDelivery?.to_address ? (
            <div className="sub" style={{ opacity: 0.75 }}>
              Last sent to: {statusSummary.latestDelivery.to_address}
            </div>
          ) : null}

          {statusSummary.latestDelivery?.error ? (
            <div className="sub" style={{ color: "#b91c1c", fontWeight: 700 }}>
              Last error: {statusSummary.latestDelivery.error}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 14,
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "#fff",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              opacity: 0.6,
            }}
          >
            Share Project Timeline
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              disabled={workingLink}
              onClick={async () => {
                try {
                  if (!shareUrl || !shareId) {
                    await ensureShareLink();
                    setHasActiveShare(true);
                    setStatus("Link ready");
                    return;
                  }

                  try {
                    await navigator.clipboard.writeText(shareUrl);
                  } catch {
                    const textarea = document.createElement("textarea");
                    textarea.value = shareUrl;
                    textarea.setAttribute("readonly", "");
                    textarea.style.position = "fixed";
                    textarea.style.top = "0";
                    textarea.style.left = "0";
                    textarea.style.opacity = "0";
                    textarea.style.pointerEvents = "none";

                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    textarea.setSelectionRange(0, textarea.value.length);

                    const ok = document.execCommand("copy");
                    document.body.removeChild(textarea);

                    if (!ok) {
                      throw new Error("Copy failed");
                    }
                  }

                  setStatus("Link copied");
                } catch (e: any) {
                  setStatus(e?.message ?? "Copy failed");
                }
              }}
            >
              {workingLink
                ? "Creating Link..."
                : !shareUrl || !shareId
                  ? "Create Share Link"
                  : "Copy Share Link"}
            </button>

            {hasActiveShare ? (
              <button
                className="btn btnDanger"
                disabled={workingLink}
                onClick={revokeLink}
              >
                Revoke Link
              </button>
            ) : null}
          </div>
        </div>



        {process.env.NODE_ENV === "development" ? (
          <SendDiagnosticsPanel projectId={projectId} />
        ) : null}
      </div>
    </div>
  );
}