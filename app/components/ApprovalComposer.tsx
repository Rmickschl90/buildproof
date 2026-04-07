"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  addOfflineApprovalAttachment,
  getOfflineApprovalAttachmentsForApproval,
} from "@/lib/offlineApprovalAttachmentOutbox";
import { flushOfflineApprovalAttachmentOutbox } from "@/lib/offlineApprovalAttachmentFlush";
import {
  addOfflineApproval,
  createTempApprovalId,
  updateOfflineApproval,
} from "@/lib/offlineApprovalOutbox";
import {
  createApprovalSendIdempotencyKey,
  createOfflineApprovalSendId,
  hasPendingOfflineApprovalSend,
  putOfflineApprovalSend,
  remapOfflineApprovalSendApprovalId,
} from "@/lib/offlineApprovalSendOutbox";
import { flushOfflineApprovalSendOutbox } from "@/lib/offlineApprovalSendFlush";

type ApprovalType =
  | "change_order"
  | "scope"
  | "material"
  | "schedule"
  | "general";

type UploadedApprovalAttachment = {
  id: string;
  filename: string | null;
  mime_type: string | null;
  path: string;
};

type InitialApproval = {
  id: string;
  title: string;
  approval_type: ApprovalType;
  description: string;
  recipient_name: string | null;
  recipient_email: string | null;
  cost_delta: number | null;
  schedule_delta: string | null;
  due_at?: string | null;
  attachments?: UploadedApprovalAttachment[];
};

type Props = {
  projectId: string;
  onComplete?: () => void | Promise<void>;
  initialApproval?: InitialApproval | null;
};

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  const local = new Date(d.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export default function ApprovalComposer({
  projectId,
  onComplete,
  initialApproval,
}: Props) {
  const [title, setTitle] = useState("");
  const [approvalType, setApprovalType] = useState<ApprovalType>("change_order");
  const [description, setDescription] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [costDelta, setCostDelta] = useState("");
  const [scheduleDelta, setScheduleDelta] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [draftApprovalId, setDraftApprovalId] = useState<string | null>(null);
  const draftApprovalIdRef = useRef<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedApprovalAttachment[]>([]);
  const [hasSyncedOfflineDraft, setHasSyncedOfflineDraft] = useState(false);
  const [hasSavedOfflineDraft, setHasSavedOfflineDraft] = useState(false);
  const [isQueueingSend, setIsQueueingSend] = useState(false);
  const [sendQueuedOffline, setSendQueuedOffline] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const draftStorageKey = useMemo(() => {
    return `approval-draft:${projectId}`;
  }, [projectId]);

  useEffect(() => {
    async function loadProjectContact() {
      if (initialApproval) return;

      const { data } = await supabase
        .from("projects")
        .select("client_name, client_email")
        .eq("id", projectId)
        .single();

      if (!data) return;

      setRecipientName((current) => current || data.client_name || "");
      setRecipientEmail((current) => current || data.client_email || "");
    }

    void loadProjectContact();
  }, [projectId, initialApproval]);

  useEffect(() => {
    if (!initialApproval) return;

    draftApprovalIdRef.current = initialApproval.id;
    setDraftApprovalId(initialApproval.id);
    window.localStorage.setItem(draftStorageKey, initialApproval.id);

    setTitle(initialApproval.title || "");
    setApprovalType(initialApproval.approval_type || "change_order");
    setDescription(initialApproval.description || "");
    setRecipientName(initialApproval.recipient_name || "");
    setRecipientEmail(initialApproval.recipient_email || "");
    setCostDelta(
      initialApproval.cost_delta !== null && initialApproval.cost_delta !== undefined
        ? String(initialApproval.cost_delta)
        : ""
    );
    setScheduleDelta(initialApproval.schedule_delta || "");
    setDueAt(toDateTimeLocalValue(initialApproval.due_at));
    setAttachments(initialApproval.attachments || []);
    setHasSavedOfflineDraft(false);
    setHasSyncedOfflineDraft(false);
    setStatus("");

    void (async () => {
      const queued = await hasPendingOfflineApprovalSend({
        approvalId: initialApproval.id.startsWith("offline-") ? null : initialApproval.id,
        offlineApprovalId: initialApproval.id.startsWith("offline-")
          ? initialApproval.id
          : null,
      });

      setSendQueuedOffline(queued);
    })();
  }, [initialApproval, draftStorageKey]);

  useEffect(() => {
    if (initialApproval) return;

    const savedDraftId = window.localStorage.getItem(draftStorageKey);
    if (!savedDraftId) return;

    draftApprovalIdRef.current = savedDraftId;
    setDraftApprovalId(savedDraftId);

    void (async () => {
      const queued = await hasPendingOfflineApprovalSend({
        approvalId: savedDraftId.startsWith("offline-") ? null : savedDraftId,
        offlineApprovalId: savedDraftId.startsWith("offline-") ? savedDraftId : null,
      });

      if (queued) {
        setSendQueuedOffline(true);
      }
    })();
  }, [draftStorageKey, initialApproval]);

  useEffect(() => {
    async function handleApprovalAttachmentComplete() {
      const approvalId = draftApprovalIdRef.current;
      if (!approvalId || approvalId.startsWith("offline-")) return;

      try {
        const token = await getAccessToken();
        await refreshDraftAttachments(token, approvalId);

        setStatus("Attachment uploaded.");

        setTimeout(() => {
          setStatus("");
        }, 2000);
      } catch (err) {
        console.error("[ApprovalComposer] refresh after attachment complete failed", err);
      }
    }

    async function handleOfflineApprovalSyncComplete(event: Event) {
      const customEvent = event as CustomEvent<{
        offlineApprovalId: string;
        approvalId: string;
      }>;

      const offlineApprovalId = customEvent.detail?.offlineApprovalId;
      const approvalId = customEvent.detail?.approvalId;

      if (!offlineApprovalId || !approvalId) return;
      if (draftApprovalIdRef.current !== offlineApprovalId) return;

      try {
        draftApprovalIdRef.current = approvalId;
        setDraftApprovalId(approvalId);
        setHasSavedOfflineDraft(false);
        setHasSyncedOfflineDraft(true);
        window.localStorage.setItem(draftStorageKey, approvalId);

        await remapOfflineApprovalSendApprovalId({
          offlineApprovalId,
          approvalId,
        });

        const token = await getAccessToken();
        await refreshDraftAttachments(token, approvalId);

        setStatus("Approval synced.");


      } catch (err) {
        console.error("[ApprovalComposer] refresh after offline approval sync failed", err);
      }
    }

    function handleApprovalSendComplete(event: Event) {
      const customEvent = event as CustomEvent<{
        approvalId: string | null;
        offlineApprovalId: string | null;
      }>;

      const completedApprovalId = customEvent.detail?.approvalId;
      const completedOfflineApprovalId = customEvent.detail?.offlineApprovalId;
      const currentApprovalId = draftApprovalIdRef.current;

      if (!currentApprovalId) return;

      if (
        currentApprovalId !== completedApprovalId &&
        currentApprovalId !== completedOfflineApprovalId
      ) {
        return;
      }

      window.localStorage.removeItem(draftStorageKey);

      setSendQueuedOffline(false);
      setHasSavedOfflineDraft(false);
      setHasSyncedOfflineDraft(false);
      setAttachments([]);
      setTitle("");
      setApprovalType("change_order");
      setDescription("");
      setRecipientName("");
      setRecipientEmail("");
      setCostDelta("");
      setScheduleDelta("");
      setDueAt("");
      setStatus("Approval sent.");

      draftApprovalIdRef.current = null;
      setDraftApprovalId(null);

      if (fileInputRef.current) fileInputRef.current.value = "";

      void onComplete?.();
    }

    window.addEventListener(
      "buildproof-approval-attachment-complete",
      handleApprovalAttachmentComplete
    );

    window.addEventListener(
      "buildproof-offline-approval-sync-complete",
      handleOfflineApprovalSyncComplete as EventListener
    );

    window.addEventListener(
      "buildproof-approval-send-complete",
      handleApprovalSendComplete as EventListener
    );

    return () => {
      window.removeEventListener(
        "buildproof-approval-attachment-complete",
        handleApprovalAttachmentComplete
      );

      window.removeEventListener(
        "buildproof-offline-approval-sync-complete",
        handleOfflineApprovalSyncComplete as EventListener
      );

      window.removeEventListener(
        "buildproof-approval-send-complete",
        handleApprovalSendComplete as EventListener
      );
    };
  }, [draftStorageKey, onComplete]);

  function clearStatus() {
    if (status) setStatus("");
  }

  function hasMeaningfulContent() {
    return (
      !!title.trim() ||
      !!description.trim() ||
      !!recipientName.trim() ||
      !!recipientEmail.trim() ||
      costDelta !== "" ||
      !!scheduleDelta.trim() ||
      !!dueAt ||
      attachments.length > 0
    );
  }

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("Missing bearer token");

    return token;
  }

  async function getExpectedApprovalAttachmentCount(args: {
    approvalId: string | null;
    offlineApprovalId: string | null;
  }): Promise<number> {
    const queuedOfflineAttachments = await getOfflineApprovalAttachmentsForApproval({
      approvalId: args.approvalId,
      offlineApprovalId: args.offlineApprovalId,
    });

    const queuedCount = queuedOfflineAttachments.length;
    const currentVisibleCount = attachments.length;

    return currentVisibleCount + queuedCount;
  }

  async function queueApprovalSendOffline(args: {
    approvalId: string | null;
    offlineApprovalId: string | null;
    projectId: string;
    expectedAttachmentCount: number;
  }) {
    const alreadyQueued = await hasPendingOfflineApprovalSend({
      approvalId: args.approvalId,
      offlineApprovalId: args.offlineApprovalId,
    });

    if (alreadyQueued) {
      setSendQueuedOffline(true);
      setStatus("Approval already queued — will send when connected.");
      return;
    }

    const now = new Date().toISOString();

    await putOfflineApprovalSend({
      id: createOfflineApprovalSendId(),
      approvalId: args.approvalId,
      offlineApprovalId: args.offlineApprovalId,
      projectId: args.projectId,
      expectedAttachmentCount: args.expectedAttachmentCount,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      syncAttemptCount: 0,
      lastSyncAttemptAt: null,
      lastError: null,
      sendIdempotencyKey: createApprovalSendIdempotencyKey(),
    });

    setSendQueuedOffline(true);
    setStatus("Approval queued — will send when connected.");

    window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
  }

  function buildApprovalPayload() {
    return {
      approvalId: draftApprovalIdRef.current,
      projectId,
      title,
      approvalType,
      description,
      recipientName,
      recipientEmail,
      costDelta: costDelta === "" ? null : Number(costDelta),
      scheduleDelta,
      dueAt: dueAt || null,
    };
  }

  async function createDraft(token: string) {
    const res = await fetch("/api/approvals/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildApprovalPayload()),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || "Failed to create draft.");
    }

    const approvalId = json?.approval?.id;
    if (!approvalId) {
      throw new Error("Draft created but missing id.");
    }

    draftApprovalIdRef.current = approvalId;
    setDraftApprovalId(approvalId);
    window.localStorage.setItem(draftStorageKey, approvalId);

    return approvalId as string;
  }

  async function updateDraft(token: string) {
    const approvalId = draftApprovalIdRef.current;

    if (!approvalId) {
      throw new Error("Missing draft id for update.");
    }

    const res = await fetch("/api/approvals/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        approvalId,
        title,
        approvalType,
        description,
        recipientName,
        recipientEmail,
        costDelta: costDelta === "" ? null : Number(costDelta),
        scheduleDelta,
        dueAt: dueAt || null,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || "Failed to update draft.");
    }

    const updatedId = json?.approval?.id || approvalId;

    draftApprovalIdRef.current = updatedId;
    setDraftApprovalId(updatedId);
    window.localStorage.setItem(draftStorageKey, updatedId);

    return updatedId as string;
  }

  async function upsertDraft(showStatusMessage = false) {
    if (!hasMeaningfulContent()) return draftApprovalIdRef.current;

    const isOffline =
      typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      let approvalId = draftApprovalIdRef.current;

      if (!approvalId) {
        approvalId = createTempApprovalId();

        await addOfflineApproval({
          id: approvalId,
          projectId,
          title,
          approvalType,
          description,
          recipientName,
          recipientEmail,
          costDelta: costDelta === "" ? null : Number(costDelta),
          scheduleDelta,
          dueAt: dueAt || null,
        });

        draftApprovalIdRef.current = approvalId;
        setDraftApprovalId(approvalId);
        window.localStorage.setItem(draftStorageKey, approvalId);
      } else {
        await addOfflineApproval({
          id: approvalId,
          projectId,
          title,
          approvalType,
          description,
          recipientName,
          recipientEmail,
          costDelta: costDelta === "" ? null : Number(costDelta),
          scheduleDelta,
          dueAt: dueAt || null,
        });
      }

      setHasSavedOfflineDraft(true);

      if (showStatusMessage) {
        setStatus("Draft saved offline — will sync when connected.");
        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
      }

      return approvalId;
    }

    const token = await getAccessToken();

    let approvalId: string;

    if (draftApprovalIdRef.current && !draftApprovalIdRef.current.startsWith("offline-")) {
      try {
        approvalId = await updateDraft(token);
      } catch (err: any) {
        const message = String(err?.message || "");

        if (
          message.toLowerCase().includes("approval not found") ||
          message.toLowerCase().includes("missing draft id")
        ) {
          draftApprovalIdRef.current = null;
          setDraftApprovalId(null);
          window.localStorage.removeItem(draftStorageKey);

          approvalId = await createDraft(token);
        } else {
          throw err;
        }
      }
    } else {
      approvalId = await createDraft(token);
    }

    if (showStatusMessage) {
      setStatus("Draft saved.");
    }

    return approvalId;
  }

  async function refreshDraftAttachments(token: string, approvalId: string) {
    const refreshRes = await fetch("/api/approvals/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        includeArchived: true,
      }),
    });

    const refreshJson = await refreshRes.json();

    if (!refreshRes.ok) {
      setStatus(refreshJson?.error || "Failed to refresh approval attachments.");
      return;
    }

    const matchedApproval = (refreshJson?.approvals || []).find(
      (item: any) => item.id === approvalId
    );

    setAttachments(matchedApproval?.attachments || []);
  }

  async function handleAttachmentChange(fileList: FileList | null) {
    if (sendQueuedOffline || isQueueingSend) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    if (isUploading) return;

    if (!title.trim() || !description.trim()) {
      setStatus("Add title and description before attachments.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      setIsUploading(true);
      setStatus(
        draftApprovalIdRef.current
          ? files.length === 1
            ? "Queueing attachment..."
            : `Queueing ${files.length} attachments...`
          : files.length === 1
            ? "Creating approval draft..."
            : `Creating approval draft and queueing ${files.length} attachments...`
      );

      let approvalId = draftApprovalIdRef.current;

      if (!approvalId) {
        approvalId = await upsertDraft(false);

        if (!approvalId) {
          setStatus("Failed to create approval draft.");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        draftApprovalIdRef.current = approvalId;
        setDraftApprovalId(approvalId);
        window.localStorage.setItem(draftStorageKey, approvalId);
      }

      const isOffline =
        typeof navigator !== "undefined" && !navigator.onLine;

      if (!isOffline) {
        // ✅ ONLINE = DIRECT UPLOAD (no outbox)
        const token = await getAccessToken();

        for (const file of files) {
          const prepRes = await fetch("/api/approval-attachments/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              approvalId,
              fileName: file.name,
            }),
          });

          const prepJson = await prepRes.json();

          if (!prepRes.ok) {
            throw new Error(prepJson?.error || "Upload prep failed");
          }

          const { uploadUrl, path, attachmentId } = prepJson;

          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });

          if (!uploadRes.ok) {
            throw new Error("File upload failed");
          }

          const insertRes = await fetch("/api/approval-attachments/insert", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: attachmentId,
              approvalId,
              path,
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
            }),
          });

          const insertJson = await insertRes.json();

          if (!insertRes.ok) {
            throw new Error(insertJson?.error || "Insert failed");
          }
        }

        // refresh after direct upload
        await refreshDraftAttachments(token, approvalId);

      } else {
        // 🟡 OFFLINE = QUEUE
        const isTempOfflineApproval = approvalId.startsWith("offline-");

        for (const file of files) {
          await addOfflineApprovalAttachment({
            approvalId: isTempOfflineApproval ? null : approvalId,
            offlineApprovalId: isTempOfflineApproval ? approvalId : null,
            file,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
          });
        }

        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
      }

      const tokenGetter = async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const token = data.session?.access_token;
        if (!token) throw new Error("Missing bearer token");

        return token;
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setStatus(
          files.length === 1
            ? "Attachment saved — will upload when connected."
            : `${files.length} attachments saved — will upload when connected.`
        );

        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      await flushOfflineApprovalAttachmentOutbox(tokenGetter);

      const token = await getAccessToken();
      await refreshDraftAttachments(token, approvalId);

      setStatus(
        files.length === 1
          ? "Attachment queued."
          : `${files.length} attachments queued.`
      );

      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setStatus(err?.message || "Failed to queue attachment.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentId: string) {
    try {
      setStatus("Removing attachment...");

      const token = await getAccessToken();

      const deleteRes = await fetch("/api/attachments/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          attachmentId,
          kind: "approval",
        }),
      });

      const deleteJson = await deleteRes.json();

      if (!deleteRes.ok) {
        setStatus(deleteJson?.error || "Failed to remove attachment.");
        return;
      }

      setAttachments((current) => current.filter((item) => item.id !== attachmentId));
      setStatus("Attachment removed.");
    } catch (err: any) {
      setStatus(err?.message || "Failed to remove attachment.");
    }
  }

  async function handleSaveDraft() {
    try {
      if (hasSyncedOfflineDraft) {
        setStatus("Approval already synced.");
        return;
      }
      if (isUploading) {
        setStatus("Please wait for attachment upload to finish.");
        return;
      }

      if (!hasMeaningfulContent()) {
        setStatus("Nothing to save yet.");
        return;
      }

      const saveOffline = async () => {
        let approvalId = draftApprovalIdRef.current;

        if (!approvalId) {
          approvalId = createTempApprovalId();

          await addOfflineApproval({
            id: approvalId,
            projectId,
            title,
            approvalType,
            description,
            recipientName,
            recipientEmail,
            costDelta: costDelta === "" ? null : Number(costDelta),
            scheduleDelta: scheduleDelta || null,
            dueAt: dueAt || null,
          });

          draftApprovalIdRef.current = approvalId;
          setDraftApprovalId(approvalId);
          window.localStorage.setItem(draftStorageKey, approvalId);
        } else if (approvalId.startsWith("offline-")) {
          await updateOfflineApproval(approvalId, {
            title,
            approvalType,
            description,
            recipientName,
            recipientEmail,
            costDelta: costDelta === "" ? null : Number(costDelta),
            scheduleDelta: scheduleDelta || null,
            dueAt: dueAt || null,
          });
        } else {
          await addOfflineApproval({
            id: approvalId,
            projectId,
            title,
            approvalType,
            description,
            recipientName,
            recipientEmail,
            costDelta: costDelta === "" ? null : Number(costDelta),
            scheduleDelta: scheduleDelta || null,
            dueAt: dueAt || null,
          });
        }

        setHasSavedOfflineDraft(true);
        setStatus("Draft saved offline — will sync when connected.");
        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
      };

      setStatus("Saving draft...");

      try {
        const isOffline =
          typeof navigator !== "undefined" && !navigator.onLine;

        if (isOffline) {
          await saveOffline();
          return;
        }

        await upsertDraft(true);
        await onComplete?.();
      } catch (err: any) {
        const message = String(err?.message || "").toLowerCase();

        const looksOffline =
          message.includes("failed to fetch") ||
          message.includes("network") ||
          message.includes("fetch");

        if (looksOffline) {
          await saveOffline();
          return;
        }

        throw err;
      }
    } catch (err: any) {
      setStatus(err?.message || "Failed to save draft.");
    }
  }

  async function handleSendApproval() {
    try {
      if (isUploading) {
        setStatus("Please wait for attachment upload to finish.");
        return;
      }

      if (isQueueingSend) {
        setStatus("Approval send is already being queued.");
        return;
      }

      if (!title.trim() || !description.trim()) {
        setStatus("Add title and description before sending approval.");
        return;
      }

      setIsQueueingSend(true);
      setStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "Queueing approval..."
          : "Sending approval..."
      );

      const approvalId = await upsertDraft(false);
      if (!approvalId) {
        setStatus("Failed to save approval before sending.");
        return;
      }

      const isOffline =
        typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        await queueApprovalSendOffline({
          approvalId: approvalId.startsWith("offline-") ? null : approvalId,
          offlineApprovalId: approvalId.startsWith("offline-") ? approvalId : null,
          projectId,
          expectedAttachmentCount: await getExpectedApprovalAttachmentCount({
            approvalId:
              approvalId && !approvalId.startsWith("offline-") ? approvalId : null,
            offlineApprovalId:
              approvalId && approvalId.startsWith("offline-") ? approvalId : null,
          }),
        });
        return;
      }

      const token = await getAccessToken();

      const sendRes = await fetch("/api/approvals/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approvalId,
          idempotencyKey: createApprovalSendIdempotencyKey(),
          expectedAttachmentCount: await getExpectedApprovalAttachmentCount({
            approvalId:
              approvalId && !approvalId.startsWith("offline-") ? approvalId : null,
            offlineApprovalId:
              approvalId && approvalId.startsWith("offline-") ? approvalId : null,
          }),
        }),
      });

      const sendJson = await sendRes.json();

      if (!sendRes.ok) {
        const message = String(sendJson?.error || "Failed to send approval.");
        const looksOffline =
          message.toLowerCase().includes("failed to fetch") ||
          message.toLowerCase().includes("network") ||
          message.toLowerCase().includes("fetch");

        if (looksOffline) {
          await queueApprovalSendOffline({
            approvalId: approvalId.startsWith("offline-") ? null : approvalId,
            offlineApprovalId: approvalId.startsWith("offline-") ? approvalId : null,
            projectId,
            expectedAttachmentCount: await getExpectedApprovalAttachmentCount({
              approvalId:
                approvalId && !approvalId.startsWith("offline-") ? approvalId : null,
              offlineApprovalId:
                approvalId && approvalId.startsWith("offline-") ? approvalId : null,
            }),
          });
          return;
        }

        setStatus(message);
        return;
      }

      window.localStorage.removeItem(draftStorageKey);

      setStatus("Approval sent.");
      draftApprovalIdRef.current = null;
      setDraftApprovalId(null);
      setHasSavedOfflineDraft(false);
      setHasSyncedOfflineDraft(false);
      setAttachments([]);
      setTitle("");
      setApprovalType("change_order");
      setDescription("");
      setRecipientName("");
      setRecipientEmail("");
      setCostDelta("");
      setScheduleDelta("");
      setDueAt("");

      if (fileInputRef.current) fileInputRef.current.value = "";

      await onComplete?.();
    } catch (err: any) {
      const message = String(err?.message || "Failed to send approval.");
      const looksOffline =
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network") ||
        message.toLowerCase().includes("fetch");

      if (looksOffline) {
        const currentApprovalId = draftApprovalIdRef.current;

        setStatus("Queueing approval...");

        await queueApprovalSendOffline({
          approvalId:
            currentApprovalId && !currentApprovalId.startsWith("offline-")
              ? currentApprovalId
              : null,
          offlineApprovalId:
            currentApprovalId && currentApprovalId.startsWith("offline-")
              ? currentApprovalId
              : null,
          projectId,
          expectedAttachmentCount: await getExpectedApprovalAttachmentCount({
            approvalId:
              currentApprovalId && !currentApprovalId.startsWith("offline-")
                ? currentApprovalId
                : null,
            offlineApprovalId:
              currentApprovalId && currentApprovalId.startsWith("offline-")
                ? currentApprovalId
                : null,
          }),
        });
      } else {
        setStatus(message);
      }
    } finally {
      setIsQueueingSend(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginTop: 12,
        border: "1px solid rgba(37,99,235,0.18)",
        boxShadow: "0 10px 24px rgba(37,99,235,0.08)",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 12 }}>Approval Request</div>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          className="input"
          placeholder="Title"
          value={title}
          onChange={(e) => {
            clearStatus();
            setTitle(e.target.value);
          }}
        />

        <select
          className="input"
          value={approvalType}
          onChange={(e) => {
            clearStatus();
            setApprovalType(e.target.value as ApprovalType);
          }}
        >
          <option value="change_order">Change Order</option>
          <option value="scope">Scope</option>
          <option value="material">Material</option>
          <option value="schedule">Schedule</option>
          <option value="general">General</option>
        </select>

        <textarea
          className="textarea"
          placeholder="Summary / description"
          value={description}
          onChange={(e) => {
            clearStatus();
            setDescription(e.target.value);
          }}
        />

        <input
          className="input"
          placeholder="Recipient name"
          value={recipientName}
          onChange={(e) => {
            clearStatus();
            setRecipientName(e.target.value);
          }}
        />

        <input
          className="input"
          placeholder="Recipient email"
          value={recipientEmail}
          onChange={(e) => {
            clearStatus();
            setRecipientEmail(e.target.value);
          }}
        />

        <input
          className="input"
          placeholder="Cost impact"
          value={costDelta}
          onChange={(e) => {
            clearStatus();
            const val = e.target.value;
            if (/^\d*\.?\d*$/.test(val)) setCostDelta(val);
          }}
        />

        <input
          className="input"
          placeholder="Schedule impact"
          value={scheduleDelta}
          onChange={(e) => {
            clearStatus();
            setScheduleDelta(e.target.value);
          }}
        />

        <input
          className="input"
          type="datetime-local"
          value={dueAt}
          onChange={(e) => {
            clearStatus();
            setDueAt(e.target.value);
          }}
        />

        <div
          style={{
            border: "1px solid rgba(15,23,42,0.08)",
            borderRadius: 12,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Attachments
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => void handleAttachmentChange(e.target.files)}
          />

          <button
            className="btn"
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? "Uploading..." : "Add attachments"}
          </button>

          {attachments.length ? (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {attachments.map((attachment) => {
                const isImage =
                  attachment.mime_type?.startsWith("image/") ||
                  (attachment.filename &&
                    /\.(jpg|jpeg|png|webp)$/i.test(attachment.filename));

                return (
                  <div
                    key={attachment.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid rgba(15,23,42,0.08)",
                      borderRadius: 10,
                      padding: 8,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#f1f5f9",
                        flex: "0 0 56px",
                      }}
                    >
                      {isImage ? (
                        <img
                          src={`/api/attachments/open?id=${attachment.id}&kind=approval`}
                          alt={attachment.filename || "attachment"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            opacity: 0.6,
                          }}
                        >
                          FILE
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <a
                        href={`/api/attachments/open?id=${attachment.id}&kind=approval`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        }}
                      >
                        {attachment.filename || "Attachment"}
                      </a>

                      <div>
                        <button
                          className="btn btnDanger"
                          type="button"
                          onClick={() => void handleRemoveAttachment(attachment.id)}
                          style={{
                            padding: "4px 8px",
                            fontSize: 12,
                            borderRadius: 6,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={handleSaveDraft}
            disabled={isUploading || hasSyncedOfflineDraft || sendQueuedOffline}
          >
            {sendQueuedOffline
              ? "Queued to Send"
              : hasSyncedOfflineDraft
                ? "Already Synced"
                : hasSavedOfflineDraft
                  ? "Saved Offline"
                  : "Save Draft"}
          </button>

          <button
            type="button"
            className="btn btnPrimary"
            onClick={handleSendApproval}
            disabled={isUploading || isQueueingSend || sendQueuedOffline}
          >
            {sendQueuedOffline
              ? "Queued to Send"
              : isQueueingSend
                ? "Queueing..."
                : "Send Approval"}
          </button>
        </div>

        {status ? <div className="sub">{status}</div> : null}
      </div>
    </div>
  );
}