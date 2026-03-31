"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addOfflineApprovalAttachment } from "@/lib/offlineApprovalAttachmentOutbox";
import { flushOfflineApprovalAttachmentOutbox } from "@/lib/offlineApprovalAttachmentFlush";
import {
  addOfflineApproval,
  createTempApprovalId,
  updateOfflineApproval,
} from "@/lib/offlineApprovalOutbox";

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
    setStatus("");
  }, [initialApproval, draftStorageKey]);

  useEffect(() => {
    if (initialApproval) return;

    const savedDraftId = window.localStorage.getItem(draftStorageKey);
    if (!savedDraftId) return;

    draftApprovalIdRef.current = savedDraftId;
    setDraftApprovalId(savedDraftId);
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
        window.localStorage.setItem(draftStorageKey, approvalId);

        const token = await getAccessToken();
        await refreshDraftAttachments(token, approvalId);

        setStatus("Approval synced.");

        
      } catch (err) {
        console.error("[ApprovalComposer] refresh after offline approval sync failed", err);
      }
    }

    window.addEventListener(
      "buildproof-approval-attachment-complete",
      handleApprovalAttachmentComplete
    );

    window.addEventListener(
      "buildproof-offline-approval-sync-complete",
      handleOfflineApprovalSyncComplete as EventListener
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

    // 🔥 OFFLINE PATH
    if (isOffline) {
      let approvalId = draftApprovalIdRef.current;

      // create new offline approval
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
        // update existing offline approval
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

      if (showStatusMessage) {
        setStatus("Saved offline — will sync when connected.");
      }

      return approvalId;
    }

    // 🌐 ONLINE PATH (UNCHANGED)
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

      for (const file of files) {
        const isOfflineApprovalId = approvalId.startsWith("offline-");

        await addOfflineApprovalAttachment({
          approvalId: isOfflineApprovalId ? null : approvalId,
          offlineApprovalId: isOfflineApprovalId ? approvalId : null,
          file,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        });
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

        if (!approvalId || !approvalId.startsWith("offline-")) {
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
        } else {
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
        }

        setStatus("Saved offline — will sync when connected.");
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

      if (!title.trim() || !description.trim()) {
        setStatus("Add title and description before sending approval.");
        return;
      }

      setStatus("Sending approval...");

      const approvalId = await upsertDraft(false);
      if (!approvalId) {
        setStatus("Failed to save approval before sending.");
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
        }),
      });

      const sendJson = await sendRes.json();

      if (!sendRes.ok) {
        setStatus(sendJson?.error || "Failed to send approval.");
        return;
      }

      window.localStorage.removeItem(draftStorageKey);

      setStatus("Approval sent.");
      draftApprovalIdRef.current = null;
      setDraftApprovalId(null);
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
      setStatus(err?.message || "Failed to send approval.");
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
            disabled={isUploading}
          >
            Save Draft
          </button>

          <button
            type="button"
            className="btn btnPrimary"
            onClick={handleSendApproval}
            disabled={isUploading}
          >
            Send Approval
          </button>
        </div>

        {status ? <div className="sub">{status}</div> : null}
      </div>
    </div>
  );
}