"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

import OnboardingWizard from "../components/OnboardingWizard";
import SendUpdatePack from "../components/SendUpdatePack";
import DeliveryHistoryPanel from "../components/DeliveryHistoryPanel";
import ProofAttachmentsWrapper from "../components/ProofAttachmentsWrapper";
import ApprovalComposer from "../components/ApprovalComposer";
import ApprovalCard from "../components/ApprovalCard";
import {
  createOfflineProof,
  listOfflineProofsForProject,
  type OfflineProofRecord,
} from "@/lib/offlineProofOutbox";
import {
  listOfflineApprovalsForProject,
  type OfflineApprovalRecord,
} from "@/lib/offlineApprovalOutbox";
import { getOfflineApprovalAttachmentsForApproval } from "@/lib/offlineApprovalAttachmentOutbox";
import OfflineAttachmentBootstrap from "../components/OfflineAttachmentBootstrap";
import {
  loadCachedDashboardProject,
  saveCachedDashboardProject,
} from "@/lib/offlineDashboardCache";
import {
  saveRecentProject,
  getRecentProjects,
} from "@/lib/offlineRecentProjects";

type Project = {
  id: string;
  title: string;
  user_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_address: string | null;
  archived_at?: string | null;
  created_at?: string | null;
};

type Proof = {
  id: number;
  content: string;
  created_at: string;
  project_id: string;
  locked_at: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  updated_at?: string | null;
};

type Approval = {
  id: string;
  title: string;
  approval_type: string;
  description: string;
  status: "draft" | "pending" | "approved" | "declined" | "expired";
  created_at: string;
  sent_at: string | null;
  responded_at: string | null;
  expired_at: string | null;
  cost_delta: number | null;
  schedule_delta: string | null;
  recipient_name: string | null;
  recipient_email: string;
  project_id: string;
};

type TimelineApproval = Approval;

type TimelineProof = Proof | (OfflineProofRecord & { isOffline: true });

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function cleanText(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isArchivedProof(p: Proof) {
  return !!p.deleted_at;
}

function isOfflineProof(p: TimelineProof): p is OfflineProofRecord & { isOffline: true } {
  return "isOffline" in p;
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

const LAST_OPEN_PROJECT_KEY = "buildproof_last_open_project_id";

function saveLastOpenProjectId(projectId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_OPEN_PROJECT_KEY, projectId);
}

function getLastOpenProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_OPEN_PROJECT_KEY);
}

function clearLastOpenProjectId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_OPEN_PROJECT_KEY);
}

export default function DashboardPage() {
  const router = useRouter();


  // ---------------- AUTH ----------------
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ---------------- DATA ----------------
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [offlineApprovals, setOfflineApprovals] = useState<OfflineApprovalRecord[]>([]);
  const [offlineProofs, setOfflineProofs] = useState<OfflineProofRecord[]>([]);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const isFlushingOfflineProofsRef = useRef(false);
  const selectedProjectId = selectedProject ? selectedProject.id : null;
  const [editingApproval, setEditingApproval] = useState<any | null>(null);


  // ---------------- INPUTS ----------------
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProofContent, setNewProofContent] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [isTemplateText, setIsTemplateText] = useState(false);

  // ---------------- STATUS ----------------
  const [status, setStatus] = useState("");
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [proofStatus, setProofStatus] = useState("");

  // ---------------- UI STATES ----------------
  const [addingProof, setAddingProof] = useState(false);
  const [workingProofId, setWorkingProofId] = useState<number | string | null>(null);
  const [openProofId, setOpenProofId] = useState<string | number | null>(null);
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);

  const [showArchivedEntries, setShowArchivedEntries] = useState(false);


  // Send mode focus
  const [isSendMode, setIsSendMode] = useState(false);
  const [isApprovalMode, setIsApprovalMode] = useState(false);
  const [sendCloseSignal, setSendCloseSignal] = useState(0);

  // ---- Client panel ----
  const [clientEditing, setClientEditing] = useState(false);
  const [clientNameDraft, setClientNameDraft] = useState("");
  const [clientEmailDraft, setClientEmailDraft] = useState("");
  const [clientPhoneDraft, setClientPhoneDraft] = useState("");
  const [projectAddressDraft, setProjectAddressDraft] = useState("");

  // ---- Project menu ----
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Entry action menu ----
  const [proofMenuOpenId, setProofMenuOpenId] = useState<number | string | null>(null);
  const proofMenuRef = useRef<HTMLDivElement | null>(null);

  // ---- Edit entry ----
  const [editingProofId, setEditingProofId] = useState<number | string | null>(null);
  const [editDraftContent, setEditDraftContent] = useState("");

  // ---- Entries search + sort ----
  const [entrySearch, setEntrySearch] = useState("");
  const [entrySortMode, setEntrySortMode] = useState<"newest" | "oldest">("newest");

  // ---- Projects search + sort ----
  const [projectSearch, setProjectSearch] = useState("");
  const [projectSortMode, setProjectSortMode] = useState<"newest" | "oldest" | "az">("newest");

  // ---- Delivery History ----
  const [showDeliveryHistory, setShowDeliveryHistory] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState("");

  // ---- Onboarding UX ----
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingCongrats, setOnboardingCongrats] = useState("");
  const [showAttachmentStep, setShowAttachmentStep] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);
  function cacheProjectSnapshot(args: {
    project?: Project | null;
    proofs?: Proof[];
    approvals?: Approval[];
  }) {
    const project = args.project ?? selectedProject;
    if (!project) return;

    const nextProofs = args.proofs ?? proofs;
    const nextApprovals = args.approvals ?? approvals;

    saveCachedDashboardProject({
      project,
      proofs: nextProofs,
      approvals: nextApprovals,
      cachedAt: new Date().toISOString(),
    });
  }

  useEffect(() => {
    if (!selectedProject) return;

    saveCachedDashboardProject({
      project: selectedProject,
      proofs,
      approvals,
      cachedAt: new Date().toISOString(),
    });
  }, [selectedProject, proofs, approvals]);

  // ---------------- AUTH BOOT ----------------
  useEffect(() => {
    (async () => {
      try {
        const projectIdFromUrl = new URLSearchParams(window.location.search).get("project");
        const restoreProjectId = projectIdFromUrl || getLastOpenProjectId();

        if (isOffline()) {
          // 🔍 DEBUG — confirm recent projects cache
          const recent = getRecentProjects();
          console.log("🧱 Offline recent projects:", recent);
          if (restoreProjectId) {
            const cached = loadCachedDashboardProject(restoreProjectId);

            if (cached) {
              setSelectedProject(cached.project);
              setProofs(cached.proofs);
              setApprovals(cached.approvals);
              setUserId(cached.project.user_id);
              await refreshOfflineProofs(cached.project.id);
              await refreshOfflineApprovals(cached.project.id);
            }
          }

          const done = window.localStorage.getItem("buildproof_onboarding_complete");
          if (done === "true") {
            setOnboardingComplete(true);
          }

          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          router.push("/login");
          return;
        }

        setUserId(data.user.id);
        setUserEmail(data.user.email ?? null);

        await flushOfflineProofs();
        await loadActiveProjects(data.user.id);

        if (projectIdFromUrl) {
          const { data: project } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectIdFromUrl)
            .single();

          if (project) {
            setSelectedProject(project);
            await loadProofs(project.id, false);
            await loadApprovals(project.id);
          }
        }

        const done = window.localStorage.getItem("buildproof_onboarding_complete");
        if (done === "true") {
          setOnboardingComplete(true);
        }
      } finally {
        setDashboardReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof navigator !== "undefined" ? navigator.onLine : true]);

  useEffect(() => {
    function handleConnectionChange() {
      setIsBrowserOnline(navigator.onLine);
    }

    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);

    return () => {
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
    };
  }, []);

  useEffect(() => {
    if (!isBrowserOnline) return;
    if (!selectedProject?.id) return;

    void (async () => {
      await refreshOfflineProofs(selectedProject.id);

      setProofStatus("Connection restored — syncing offline entries...");

      // 🔥 proofs
      await flushOfflineProofs();

      // 🔥 attachments (NEW)
      const { flushOfflineAttachmentOutbox } = await import(
        "@/lib/offlineAttachmentFlush"
      );

      const { supabase } = await import("@/lib/supabase");

      const getAccessToken = async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) throw new Error("Not logged in");
        return token;
      };

      await flushOfflineAttachmentOutbox(getAccessToken);

      // 🔄 reload everything
      await loadProofs(selectedProject.id, showArchivedEntries);
      await refreshOfflineProofs(selectedProject.id);
    })();
  }, [isBrowserOnline, selectedProject?.id, showArchivedEntries]);



  useEffect(() => {
    if (!selectedProject) {
      setOfflineProofs([]);
      setOfflineApprovals([]);
      return;
    }

    void refreshOfflineProofs(selectedProject.id);
    void refreshOfflineApprovals(selectedProject.id);

    setClientNameDraft(selectedProject.client_name ?? "");
    setClientEmailDraft(selectedProject.client_email ?? "");
    setClientPhoneDraft(selectedProject.client_phone ?? "");
    setProjectAddressDraft(selectedProject.project_address ?? "");

    const hasAnyClient =
      !!(selectedProject.client_name && selectedProject.client_name.trim()) ||
      !!(selectedProject.client_email && selectedProject.client_email.trim()) ||
      !!(selectedProject.client_phone && selectedProject.client_phone.trim());

    setClientEditing(!hasAnyClient);

    setProjectMenuOpen(false);
    setRenaming(false);
    setRenameTitle(selectedProject.title || "");
    setProofMenuOpenId(null);

    setEditingProofId(null);
    setEditDraftContent("");

    setShowDeliveryHistory(false);
    setShowArchivedEntries(false);

    setIsSendMode(false);
    setSendCloseSignal((k) => k + 1);
  }, [selectedProject?.id]);



  useEffect(() => {
    function handleBuildProofDataChanged() {
      if (!selectedProject?.id) return;

      if (!navigator.onLine) {
        void refreshOfflineProofs(selectedProject.id);
        void refreshOfflineApprovals(selectedProject.id);
        return;
      }

      void loadProofs(selectedProject.id, showArchivedEntries);
      void loadApprovals(selectedProject.id, showArchivedEntries);
    }

    window.addEventListener("buildproof-data-changed", handleBuildProofDataChanged);

    return () => {
      window.removeEventListener("buildproof-data-changed", handleBuildProofDataChanged);
    };
  }, [selectedProject?.id, showArchivedEntries]);

  useEffect(() => {
    if (!isSendMode && !isApprovalMode) return;

    setProjectMenuOpen(false);
    setRenaming(false);
    setProofMenuOpenId(null);
    setEditingProofId(null);
    setEditDraftContent("");
    setOpenProofId(null);
    setShowDeliveryHistory(false);
  }, [isSendMode, isApprovalMode]);

  useEffect(() => {
    if (!projectMenuOpen) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const el = projectMenuRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) {
        setProjectMenuOpen(false);
        setRenaming(false);
        setRenameTitle(selectedProject?.title || "");
      }
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [projectMenuOpen, selectedProject?.id]);

  useEffect(() => {
    if (!proofMenuOpenId) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const el = proofMenuRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setProofMenuOpenId(null);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProofMenuOpenId(null);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [proofMenuOpenId]);

  useEffect(() => {
    if (!proofMenuOpenId) return;

    function closeProofMenu() {
      setProofMenuOpenId(null);
    }

    window.addEventListener("scroll", closeProofMenu, true);
    window.addEventListener("resize", closeProofMenu);

    return () => {
      window.removeEventListener("scroll", closeProofMenu, true);
      window.removeEventListener("resize", closeProofMenu);
    };
  }, [proofMenuOpenId]);

  useEffect(() => {
    if (!renaming) return;
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [renaming]);

  useEffect(() => {
    if (!status) return;

    const lower = status.toLowerCase();

    const shouldAutoClear =
      lower.includes("saved") ||
      lower.includes("downloaded") ||
      lower.includes("renamed") ||
      lower.includes("archived") ||
      lower.includes("restored") ||
      lower.includes("deleted") ||
      lower.includes("updated") ||
      lower.includes("preparing pdf") ||
      lower.includes("preparing dispute package") ||
      lower.includes("saving client");

    if (!shouldAutoClear) return;

    const timeout = window.setTimeout(() => {
      setStatus((current) => (current === status ? "" : current));
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (!proofStatus) return;

    const lower = proofStatus.toLowerCase();

    const shouldAutoClear =
      lower.includes("saved") ||
      lower.includes("archived") ||
      lower.includes("restored") ||
      lower.includes("deleted") ||
      lower.includes("updated") ||
      lower.includes("saving") ||
      lower.includes("archiving") ||
      lower.includes("restoring") ||
      lower.includes("deleting");

    if (!shouldAutoClear) return;

    const timeout = window.setTimeout(() => {
      setProofStatus((current) => (current === proofStatus ? "" : current));
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [proofStatus]);

  useEffect(() => {
    if (!status || !statusRef.current) return;

    const el = statusRef.current;
    const rect = el.getBoundingClientRect();

    const isOutsideView =
      rect.top < 0 || rect.bottom > window.innerHeight;

    if (isOutsideView) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [status]);



  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("Not logged in");

    return token;
  }

  async function testCreateApproval() {
    const token = await getAccessToken();

    const res = await fetch("/api/approvals/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId: "06726a80-0abd-4415-b021-3cfa11ee1d23",
        title: "Patio Extension Approval",
        approvalType: "change_order",
        description: "Add additional patio area behind garage.",
        recipientName: "Test Client",
        recipientEmail: "test@example.com",
        costDelta: 2500,
        scheduleDelta: "Adds 2 days",
        dueAt: "2026-03-20T17:00:00.000Z",
      }),
    });

    const data = await res.json();
    console.log(res.status, data);
  }

  async function testUpdateApproval() {
    const token = await getAccessToken();

    const res = await fetch("/api/approvals/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        approvalId: "619fb19e-bc2a-4921-a184-ed80f07bc013",
        title: "Patio Extension Approval Updated",
        approvalType: "change_order",
        description: "Add additional patio area behind garage with widened walkway.",
        recipientName: "Test Client",
        recipientEmail: "test@example.com",
        costDelta: 3200,
        scheduleDelta: "Adds 3 days",
        dueAt: "2026-03-22T17:00:00.000Z",
      }),
    });

    const data = await res.json();
    console.log(res.status, data);
  }

  async function testSendApproval() {
    const token = await getAccessToken();

    const res = await fetch("/api/approvals/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        approvalId: "68fbfa6b-0d96-436f-b545-b5f9e0bab7e1",
      }),
    });

    const data = await res.json();
    console.log(res.status, data);
  }

  // ---------------- DATA LOADERS ----------------
  async function refreshOfflineProofs(projectId?: string | null) {
    if (!projectId) {
      setOfflineProofs([]);
      return;
    }

    try {
      const records = await listOfflineProofsForProject(projectId);

      const serverContentSet = new Set(
        proofs
          .filter((p) => p.project_id === projectId)
          .map((p) => (p.content || "").trim().toLowerCase())
      );

      const filtered = records.filter(
        (record) => !serverContentSet.has((record.content || "").trim().toLowerCase())
      );

      setOfflineProofs(filtered);
    } catch (error) {
      console.error("Failed to load offline proofs", error);
      setOfflineProofs([]);
    }
  }

  async function refreshOfflineApprovals(projectId?: string | null) {
    if (!projectId) {
      setOfflineApprovals([]);
      return;
    }

    try {
      const records = await listOfflineApprovalsForProject(projectId);

      const serverIdSet = new Set(approvals.map((a) => a.id));

      const filtered = records.filter(
        (record: OfflineApprovalRecord) => !serverIdSet.has(record.id)
      );

      setOfflineApprovals(filtered);
    } catch (error) {
      console.error("Failed to load offline approvals", error);
      setOfflineApprovals([]);
    }
  }

  async function flushOfflineProofs() {
    if (isFlushingOfflineProofsRef.current) return;
    isFlushingOfflineProofsRef.current = true;

    try {
      const {
        listPendingOfflineProofs,
        markOfflineProofSyncing,
        markOfflineProofFailed,
        deleteOfflineProof,
      } = await import("@/lib/offlineProofOutbox");

      const pending = await listPendingOfflineProofs();

      if (pending.length === 0) {
        if (selectedProject?.id) {
          await refreshOfflineProofs(selectedProject.id);
        }
        return;
      }

      for (const p of pending) {
        try {
          await markOfflineProofSyncing(p.id);

          const { data, error } = await supabase
            .from("proofs")
            .insert({
              content: p.content,
              project_id: p.projectId,
            })
            .select("id")
            .single();

          if (error) {
            await markOfflineProofFailed(p.id, error.message);
            continue;
          }

          if (data?.id) {
            const { attachOfflineAttachmentsToProof } = await import("@/lib/offlineAttachmentOutbox");
            const { flushOfflineAttachmentOutbox } = await import("@/lib/offlineAttachmentFlush");

            await attachOfflineAttachmentsToProof(p.id, data.id);
            await flushOfflineAttachmentOutbox(getAccessToken);
          }

          await deleteOfflineProof(p.id);
        } catch (err) {
          console.error("Offline proof flush failed", err);
        }
      }

      if (selectedProject?.id) {
        await loadProofs(selectedProject.id, showArchivedEntries);
        await refreshOfflineProofs(selectedProject.id);
      }
    } catch (err) {
      console.error("Offline proof flush failed", err);
    } finally {
      isFlushingOfflineProofsRef.current = false;
    }
  }

  async function loadActiveProjects(uid: string) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const recent = getRecentProjects();

      if (recent.length > 0) {
        setProjects(recent as any);
      }

      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .select("id,title,user_id,client_name,client_email,client_phone,project_address,archived_at,created_at")
      .eq("user_id", uid)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(`Load projects failed: ${error.message}`);
      return;
    }

    const nextProjects = (data ?? []) as Project[];
    setProjects(nextProjects);
    setStatus("");
  }

  async function loadProofs(
    projectId: string,
    includeArchived = showArchivedEntries,
    projectOverride?: Project
  ) {
    const source = includeArchived ? "proofs" : "proofs_active";

    // 🔒 Prevent fetch while offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const { data, error } = await supabase
      .from(source)
      .select("id,content,created_at,project_id,locked_at,deleted_at,deleted_by,updated_at")
      .eq("project_id", projectId);

    if (error) {
      // 🔒 Suppress offline-related noise
      const message = String(error.message || "").toLowerCase();

      if (
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("fetch")
      ) {
        return;
      }

      setProofStatus(`Load entries failed: ${error.message}`);
      return;
    }

    const nextProofs = (data ?? []) as Proof[];
    setProofs(nextProofs);
    cacheProjectSnapshot({
      project: projectOverride ?? selectedProject,
      proofs: nextProofs,
    });
    await refreshOfflineProofs(projectId);
    setProofStatus("");
  }

  async function loadApprovals(
    projectId: string,
    includeArchived = showArchivedEntries,
    projectOverride?: Project
  ) {
    try {
      // 🔒 Prevent fetch while offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }

      const token = await getAccessToken();

      const res = await fetch("/api/approvals/list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId, includeArchived }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        const message = String(json?.error || "Failed to load approvals.").toLowerCase();

        if (
          message.includes("failed to fetch") ||
          message.includes("network") ||
          message.includes("fetch")
        ) {
          return;
        }

        setStatus(json?.error || "Failed to load approvals.");
        return;
      }

      const nextApprovals = (json?.approvals ?? []) as Approval[];
      setApprovals(nextApprovals);
      await refreshOfflineApprovals(projectId);
      cacheProjectSnapshot({
        project: projectOverride ?? selectedProject,
        approvals: nextApprovals,
      });
    } catch (err: any) {
      const message = String(err?.message || "Failed to load approvals.");

      if (
        message.toLowerCase().includes("failed to fetch") ||
        message.toLowerCase().includes("network") ||
        message.toLowerCase().includes("fetch")
      ) {
        return;
      }

      setStatus(message);
    }
  }

  // ---------------- PROJECT CRUD ----------------
  async function addProject() {
    if (!newProjectTitle.trim() || !userId) return;

    setStatus("Saving project...");

    const { error } = await supabase.from("projects").insert({
      title: newProjectTitle.trim(),
      user_id: userId,
    });

    if (error) {
      setStatus(`Add project failed: ${error.message}`);
      return;
    }

    setNewProjectTitle("");
    await loadActiveProjects(userId);
    scrollBackToOnboarding(500);
    setStatus("");
  }

  async function saveProjectRename() {
    if (!selectedProject) return;

    const next = renameTitle.trim();
    if (!next) {
      setStatus("Project name can’t be empty.");
      return;
    }

    try {
      setStatus("Saving project name...");

      const { error } = await supabase.from("projects").update({ title: next }).eq("id", selectedProject.id);

      if (error) throw error;

      const updatedProject = { ...selectedProject, title: next };

      setSelectedProject(updatedProject);
      setProjects((list) => list.map((p) => (p.id === selectedProject.id ? { ...p, title: next } : p)));
      cacheProjectSnapshot({ project: updatedProject });

      setStatus("Project renamed ✅");
      renameInputRef.current?.blur();
      setRenaming(false);
      setProjectMenuOpen(false);
    } catch (e: any) {
      setStatus(e?.message ?? "Rename failed");
    }
  }

  function cancelRename() {
    setRenaming(false);
    setProjectMenuOpen(false);
    setRenameTitle(selectedProject?.title || "");
  }

  async function archiveProject() {
    if (!selectedProject || !userId) return;

    const ok = window.confirm("Archive this project? You can view it in Archived.");
    if (!ok) return;

    try {
      setStatus("Archiving project...");
      const iso = new Date().toISOString();

      const { error } = await supabase.from("projects").update({ archived_at: iso }).eq("id", selectedProject.id);

      if (error) throw error;

      setStatus("Project archived ✅");

      setProjects((list) => list.filter((p) => p.id !== selectedProject.id));
      setSelectedProject(null);
      setProofs([]);

      await loadActiveProjects(userId);

      setProjectMenuOpen(false);
      setRenaming(false);
      setProofMenuOpenId(null);
      setEditingProofId(null);
      setEditDraftContent("");

      setIsSendMode(false);
      setSendCloseSignal((k) => k + 1);
    } catch (e: any) {
      setStatus(e?.message ?? "Archive failed");
    }
  }

  function closeProjectView() {
    clearLastOpenProjectId();

    if (navigator.onLine) {
      router.replace("/dashboard");
    }
    setSelectedProject(null);
    setProofs([]);
    setApprovals([]);
    setOpenProofId(null);
    setProjectMenuOpen(false);
    setRenaming(false);
    setProofMenuOpenId(null);
    setEditingProofId(null);
    setEditDraftContent("");
    setShowDeliveryHistory(false);
    setShowArchivedEntries(false);

    setIsSendMode(false);
    setSendCloseSignal((k) => k + 1);

    setStatus("");
    setProofStatus("");
  }

  async function exportProjectPdf() {
    if (!selectedProject) return;

    try {
      setStatus("Preparing PDF...");
      const token = await getAccessToken();

      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "PDF export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const safeTitle = (selectedProject.title || "BuildProof_Project").replace(/[^\w\-]+/g, "_");

      const a = document.createElement("a");
      a.href = url;
      a.download = `BuildProof_${safeTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
      setStatus("PDF downloaded.");
    } catch (err: any) {
      setStatus(err?.message || "PDF export failed");
    }
  }

  async function exportDisputePackage() {
    if (!selectedProject) return;

    const confirmed = window.confirm(
      "Export dispute package?\n\nThis includes the project timeline, attachments, and delivery history."
    );

    if (!confirmed) return;

    try {
      setStatus("Preparing dispute package...");
      const token = await getAccessToken();

      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          reportMode: "dispute",
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Dispute package export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const safeTitle = (selectedProject.title || "BuildProof_Project").replace(/[^\w\-]+/g, "_");

      const a = document.createElement("a");
      a.href = url;
      a.download = `BuildProof_Dispute_Package_${safeTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
      setStatus("Dispute package downloaded.");
    } catch (err: any) {
      setStatus(err?.message || "Dispute package export failed");
    }
  }

  // ---------------- ENTRIES ----------------
  async function addProof() {
    if (!selectedProject) {
      setProofStatus("Select a project first.");
      return;
    }

    const projectId = selectedProject.id;

    const text = newProofContent.trim();
    if (!text) {
      setProofStatus("Type an entry note first.");
      return;
    }

    async function saveOfflineProof() {
      await createOfflineProof({
        projectId,
        content: text,
      });

      setNewProofContent("");
      setShowTemplates(false);
      setShowAttachmentStep(false);

      await refreshOfflineProofs(projectId);

      setProofStatus("Saved offline ✅ — will sync when service returns");
      scrollBackToOnboarding(700);
    }

    try {
      setAddingProof(true);
      setProofStatus("Saving entry...");

      if (!navigator.onLine) {
        await saveOfflineProof();
        return;
      }

      let result:
        | {
          data: { id: number } | null;
          error: { message: string } | null;
        }
        | undefined;

      try {
        const response = await supabase
          .from("proofs")
          .insert({ content: text, project_id: projectId })
          .select("id")
          .single();

        result = {
          data: (response.data as { id: number } | null) ?? null,
          error: response.error ? { message: response.error.message } : null,
        };
      } catch {
        await saveOfflineProof();
        return;
      }

      if (!result || result.error) {
        const message = result?.error?.message || "";
        const lower = message.toLowerCase();

        if (
          !message ||
          lower.includes("load failed") ||
          lower.includes("failed to fetch") ||
          lower.includes("fetch") ||
          lower.includes("network") ||
          lower.includes("offline")
        ) {
          await saveOfflineProof();
          return;
        }

        setProofStatus(`Add entry failed: ${message}`);
        return;
      }

      setNewProofContent("");
      setShowTemplates(false);
      setShowAttachmentStep(true);

      await loadProofs(projectId, showArchivedEntries);

      if (result.data?.id != null) {
        setOpenProofId(result.data.id);
      }

      setProofStatus("Saved ✅ — add photos/files below");
      scrollBackToOnboarding(700);
    } catch (err: any) {
      const message = err?.message || "";
      const lower = message.toLowerCase();

      if (
        !message ||
        lower.includes("load failed") ||
        lower.includes("failed to fetch") ||
        lower.includes("fetch") ||
        lower.includes("network") ||
        lower.includes("offline")
      ) {
        try {
          await saveOfflineProof();
          return;
        } catch (offlineErr: any) {
          setProofStatus(offlineErr?.message || "Offline save failed");
          return;
        }
      }

      setProofStatus(message || "Add entry failed");
    } finally {
      setAddingProof(false);
    }
  }

  async function archiveEntry(proofId: number) {
    if (!selectedProject) return;

    const ok = window.confirm(
      "Archive this entry?\n\nArchived entries are hidden from the normal timeline but remain in the project record."
    );
    if (!ok) return;

    if (!showArchivedEntries) {
      setProofs((list) => list.filter((p) => p.id !== proofId));
    } else {
      setProofs((list) =>
        list.map((p) => (p.id === proofId ? { ...p, deleted_at: new Date().toISOString() } : p))
      );
    }

    if (openProofId === proofId) setOpenProofId(null);
    if (editingProofId === proofId) {
      setEditingProofId(null);
      setEditDraftContent("");
    }

    try {
      setWorkingProofId(proofId);
      setProofStatus("Archiving...");

      const token = await getAccessToken();

      const res = await fetch("/api/proofs/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Archive failed");

      setProofStatus("Archived ✅");
      loadProofs(selectedProject.id, showArchivedEntries);
    } catch (e: any) {
      setProofStatus(e?.message ?? "Archive failed");
      loadProofs(selectedProject.id, showArchivedEntries);
    } finally {
      setWorkingProofId(null);
      setProofMenuOpenId(null);
    }
  }

  async function restoreEntry(proofId: number) {
    if (!selectedProject) return;

    const ok = window.confirm(
      "Restore this entry to the main timeline?"
    );
    if (!ok) return;

    if (showArchivedEntries) {
      setProofs((list) =>
        list.map((p) =>
          p.id === proofId ? { ...p, deleted_at: null, deleted_by: null } : p
        )
      );
    }

    try {
      setWorkingProofId(proofId);
      setProofStatus("Restoring...");

      const token = await getAccessToken();

      const res = await fetch("/api/proofs/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Restore failed");

      setProofStatus("Restored ✅");
      await loadProofs(selectedProject.id, showArchivedEntries);
    } catch (e: any) {
      setProofStatus(e?.message ?? "Restore failed");
      await loadProofs(selectedProject.id, showArchivedEntries);
    } finally {
      setWorkingProofId(null);
      setProofMenuOpenId(null);
    }
  }

  async function deleteEntry(proofId: number) {
    if (!selectedProject) return;

    const ok = window.confirm("Delete this entry permanently? This cannot be undone.");
    if (!ok) return;

    try {
      setWorkingProofId(proofId);
      setProofStatus("Deleting...");

      const token = await getAccessToken();

      const res = await fetch("/api/proofs/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Delete failed");

      if (openProofId === proofId) setOpenProofId(null);

      await loadProofs(selectedProject.id, showArchivedEntries);
      setProofStatus("Deleted ✅");

      if (editingProofId === proofId) {
        setEditingProofId(null);
        setEditDraftContent("");
      }
    } catch (e: any) {
      setProofStatus(e?.message ?? "Delete failed");
    } finally {
      setWorkingProofId(null);
      setProofMenuOpenId(null);
    }
  }

  function startEditEntry(proof: Proof) {
    if (proof.locked_at) return;

    setEditingProofId(proof.id);
    setEditDraftContent(proof.content ?? "");
    setProofMenuOpenId(null);
    setOpenProofId(proof.id);
  }

  function cancelEditEntry() {
    setEditingProofId(null);
    setEditDraftContent("");
  }

  async function saveEditEntry(proofId: number) {
    if (!selectedProject) return;

    const next = editDraftContent.trim();
    if (!next) {
      alert("Entry text can’t be empty. (Delete it instead.)");
      return;
    }

    try {
      setWorkingProofId(proofId);
      setProofStatus("Saving...");

      const { error } = await supabase.from("proofs").update({ content: next }).eq("id", proofId);
      if (error) throw error;

      await loadProofs(selectedProject.id, showArchivedEntries);
      setProofStatus("Updated ✅");
      setEditingProofId(null);
      setEditDraftContent("");
    } catch (e: any) {
      setProofStatus(e?.message ?? "Update failed");
    } finally {
      setWorkingProofId(null);
    }
  }

  async function saveClient() {
    if (!selectedProject || !userId) return;

    try {
      setStatus("Saving client...");

      const previousEmail = (selectedProject.client_email || "").trim().toLowerCase() || null;
      const nextEmail = (clientEmailDraft.trim() || "").toLowerCase() || null;

      const payload = {
        client_name: clientNameDraft.trim() || null,
        client_email: nextEmail,
        client_phone: clientPhoneDraft.trim() || null,
        project_address: projectAddressDraft.trim() || null,
      };

      const { error } = await supabase.from("projects").update(payload).eq("id", selectedProject.id);

      if (error) throw error;

      if (previousEmail !== nextEmail) {
        const { error: eventError } = await supabase.from("project_contact_events").insert({
          project_id: selectedProject.id,
          user_id: userId,
          event_type: "client_email_changed",
          previous_email: previousEmail,
          new_email: nextEmail,
        });

        if (eventError) {
          console.error("Failed to log client email change", eventError);
        }
      }

      const updatedProject = { ...selectedProject, ...payload };

      setSelectedProject(updatedProject);
      setProjects((list) =>
        list.map((p) => (p.id === selectedProject.id ? { ...p, ...payload } : p))
      );
      cacheProjectSnapshot({ project: updatedProject });

      setStatus(
        previousEmail !== nextEmail
          ? "Client saved ✅ Future updates will use this email."
          : "Client saved ✅"
      );
      setClientEditing(false);
    } catch (e: any) {
      setStatus(e?.message ?? "Save failed");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const entryTemplates = [
    {
      name: "Daily Progress",
      text: "Daily Progress\n\nWork completed:\nMaterials used:\nNotes:",
    },
    {
      name: "Inspection Passed",
      text: "Inspection Passed\n\nInspector:\nArea inspected:\nNotes:",
    },
    {
      name: "Weather Delay",
      text: "Weather Delay\n\nConditions:\nWork affected:\nNotes:",
    },
    {
      name: "Materials Delivered",
      text: "Materials Delivered\n\nMaterials:\nSupplier:\nNotes:",
    },
    {
      name: "Crew On Site",
      text: "Crew On Site\n\nCrew members:\nWork performed:\nNotes:",
    },
  ];

  function scrollToElementById(id: string, delay = 0) {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const absoluteTop = window.scrollY + rect.top;
      const offset = 110;
      const top = Math.max(absoluteTop - offset, 0);

      window.scrollTo({
        top,
        behavior: "smooth",
      });
    }, delay);
  }

  function pulseHighlight(targetId: string) {
    setHighlightTarget(targetId);
    scrollToElementById(targetId, 50);

    setTimeout(() => {
      setHighlightTarget((current) => (current === targetId ? null : current));
    }, 2200);
  }

  function scrollBackToOnboarding(delay = 0) {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }, Math.max(delay - 80, 0));

    scrollToElementById("onboarding-wizard", delay);
  }

  function handleCreateProjectClick() {
    pulseHighlight("onboarding-project-area");

    setTimeout(() => {
      const el = document.getElementById("new-project-input") as HTMLInputElement | null;
      el?.focus();
    }, 250);
  }

  function handleOpenFirstProject() {
    pulseHighlight("onboarding-project-list");
  }

  function handleAddFirstEntryClick() {
    pulseHighlight("onboarding-entry-area");

    setTimeout(() => {
      const el = document.getElementById("new-entry-textarea") as HTMLTextAreaElement | null;
      el?.focus();
    }, 250);
  }

  function handleAddFilesClick() {
    setHighlightTarget("onboarding-attachments-area");

    setTimeout(() => {
      const el = document.getElementById("onboarding-attachments-area");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);

    setTimeout(() => {
      setHighlightTarget((current) =>
        current === "onboarding-attachments-area" ? null : current
      );
    }, 2200);
  }

  function handleSendFirstUpdateClick() {
    pulseHighlight("onboarding-send-area");
  }



  function handleAddClientInfoClick() {
    setHighlightTarget("client-info-section");
    scrollToElementById("client-info-section", 50);

    setTimeout(() => {
      setClientEditing(true);
    }, 250);

    setTimeout(() => {
      const el = document.getElementById("client-email-input") as HTMLInputElement | null;
      el?.focus();
    }, 450);

    setTimeout(() => {
      setHighlightTarget((current) => (current === "client-info-section" ? null : current));
    }, 2200);
  }

  function finishOnboarding() {
    if (onboardingComplete) return;

    setShowAttachmentStep(false);
    setOnboardingComplete(true);

    setOnboardingCongrats(
      "🎉 First update sent. Your project timeline is now live and ready to use."
    );

    window.localStorage.setItem("buildproof_onboarding_complete", "true");

    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      active?.blur();
    }, 50);

    setTimeout(() => {
      const el = document.getElementById("onboarding-success");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 250);

    setTimeout(() => {
      setOnboardingCongrats("");
    }, 9000);
  }

  const clientSummary = useMemo(() => {
    if (!selectedProject) return "";
    const name = selectedProject.client_name?.trim();
    const email = selectedProject.client_email?.trim();
    const phone = selectedProject.client_phone?.trim();
    const address = selectedProject.project_address?.trim();
    const bits = [name, email, phone, address].filter(Boolean);
    return bits.length ? bits.join(" • ") : "No client saved";
  }, [selectedProject]);

  const filteredProjects = useMemo<Project[]>(() => {
    const q = cleanText(projectSearch);
    let list: Project[] = [...projects];

    if (q) {
      list = list.filter((p) => {
        const hay = cleanText(
          `${p.title || ""} ${p.client_name || ""} ${p.client_email || ""} ${p.client_phone || ""} ${p.project_address || ""}`
        );
        return hay.includes(q);
      });
    }

    if (projectSortMode === "az") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (projectSortMode === "oldest") {
      list.sort((a, b) => ((a.created_at || "") > (b.created_at || "") ? 1 : -1));
    } else {
      list.sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1));
    }

    return list;
  }, [projects, projectSearch, projectSortMode]);

  const filteredProofs = useMemo<TimelineProof[]>(() => {
    const serverContentSet = new Set(
      proofs.map((p) => cleanText(p.content || ""))
    );

    const dedupedOfflineProofs = offlineProofs
      .filter((p) => !serverContentSet.has(cleanText(p.content || "")))
      .map((p) => ({
        ...p,
        isOffline: true as const,
      }));

    let list: TimelineProof[] = [
      ...proofs,
      ...dedupedOfflineProofs,
    ];

    list =
      entrySortMode === "newest"
        ? list.sort((a, b) =>
          (("isOffline" in a ? a.createdAt : a.created_at) <
            ("isOffline" in b ? b.createdAt : b.created_at))
            ? 1
            : -1
        )
        : list.sort((a, b) =>
          (("isOffline" in a ? a.createdAt : a.created_at) >
            ("isOffline" in b ? b.createdAt : b.created_at))
            ? 1
            : -1
        );

    const q = cleanText(entrySearch);
    if (!q) return list;

    return list.filter((p) =>
      cleanText(
        `${p.content} ${"isOffline" in p ? p.createdAt : p.created_at} ${p.id}`
      ).includes(q)
    );
  }, [proofs, offlineProofs, entrySearch, entrySortMode]);

  const [visibleApprovals, setVisibleApprovals] = useState<Approval[]>([]);

useEffect(() => {
  let cancelled = false;

  async function buildVisibleApprovals() {
    const serverIdSet = new Set(approvals.map((a) => a.id));

    const normalizedOfflineApprovals = await Promise.all(
      offlineApprovals
        .filter((a) => !serverIdSet.has(a.id))
        .map(async (a) => {
          const queuedAttachments = await getOfflineApprovalAttachmentsForApproval({
            approvalId: null,
            offlineApprovalId: a.id,
          });

          return {
            id: a.id,
            title: a.title,
            approval_type: a.approvalType,
            description: a.description,
            status: "draft" as const,
            created_at: new Date(a.createdAt).toISOString(),
            sent_at: null,
            responded_at: null,
            expired_at: null,
            cost_delta: a.costDelta,
            schedule_delta: a.scheduleDelta,
            recipient_name: a.recipientName || null,
            recipient_email: a.recipientEmail || "",
            project_id: a.projectId,
            attachments: queuedAttachments.map((item) => ({
              id: item.id,
              filename: item.fileName ?? null,
              mime_type: item.mimeType ?? null,
              path: "",
            })),
          };
        })
    );

    const nextVisibleApprovals = [...approvals, ...normalizedOfflineApprovals].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    );

    if (!cancelled) {
      setVisibleApprovals(nextVisibleApprovals);
    }
  }

  void buildVisibleApprovals();

  return () => {
    cancelled = true;
  };
}, [approvals, offlineApprovals]);

  const draftApprovals = useMemo(() => {
    return visibleApprovals.filter(
      (a) => a.status === "draft" || a.status === "pending"
    );
  }, [visibleApprovals]);

  return (
    <>
      <OfflineAttachmentBootstrap />

      <div className="container">
        <div className="shell">
          <div className="card">
            <div className="row">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src="/buildproof-logo.png"
                  alt="BuildProof"
                  style={{ height: 60, width: "auto", display: "block" }}
                />
              </div>
              <button className="btn btnDanger" onClick={logout}>
                Logout
              </button>
            </div>

            <p className="sub">
              Signed in as <b>{userEmail}</b>
            </p>


            {status && (
              <div ref={statusRef} className="notice">
                {status}
              </div>
            )}
            {sendSuccessMessage ? (
              <div
                className="card"
                style={{
                  marginTop: 10,
                  border: "1px solid rgba(16,185,129,0.22)",
                  background: "rgba(16,185,129,0.08)",
                  boxShadow: "0 12px 30px rgba(16,185,129,0.10)",
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 2 }}>Update sent</div>
                <div className="sub" style={{ opacity: 0.9 }}>
                  {sendSuccessMessage}
                </div>
              </div>
            ) : null}
          </div>

          {dashboardReady ? (
            <OnboardingWizard
              projectCount={projects.length}
              entryCount={proofs.length}
              hasSelectedProject={!!selectedProject}
              hasClientEmail={!!selectedProject?.client_email?.trim()}
              showAttachmentStep={showAttachmentStep}
              isCompleted={onboardingComplete}
              onCreateProject={handleCreateProjectClick}
              onOpenFirstProject={handleOpenFirstProject}
              onAddFirstEntry={handleAddFirstEntryClick}
              onAddFiles={handleAddFilesClick}
              onSendFirstUpdate={handleSendFirstUpdateClick}
              onAddClientInfo={handleAddClientInfoClick}
            />
          ) : null}

          {onboardingCongrats ? (
            <div
              id="onboarding-success"
              className="card"
              style={{
                border: "1px solid rgba(16,185,129,0.22)",
                background: "rgba(16,185,129,0.08)",
                boxShadow: "0 12px 30px rgba(16,185,129,0.10)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>You’re ready to go</div>
              <div className="sub" style={{ opacity: 0.9 }}>
                {onboardingCongrats}
              </div>
            </div>
          ) : null}

          {!isSendMode && !selectedProject ? (
            <div
              id="onboarding-project-area"
              className="card"
              style={{
                border:
                  highlightTarget === "onboarding-project-area"
                    ? "2px solid rgba(37,99,235,0.55)"
                    : undefined,
                boxShadow:
                  highlightTarget === "onboarding-project-area"
                    ? "0 0 0 6px rgba(59,130,246,0.12)"
                    : undefined,
                transition: "all 0.25s ease",
              }}
            >
              <div className="row" style={{ alignItems: "center" }}>
                <div style={{ fontWeight: 800 }}>Projects</div>

                <button className="btn" onClick={() => router.push("/archived")}>
                  Archived
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <input
                  className="input"
                  placeholder="Search projects or clients..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  style={{ flex: "1 1 220px", minWidth: 180 }}
                />

                <select
                  className="input"
                  value={projectSortMode}
                  onChange={(e) => setProjectSortMode(e.target.value as any)}
                  style={{ width: 160 }}
                  title="Sort projects"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="az">A–Z</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input
                  id="new-project-input"
                  className="input"
                  placeholder="New project title"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                />
                <button className="btn btnPrimary" onClick={addProject}>
                  Add
                </button>
              </div>

              <div
                id="onboarding-project-list"
                className="list"
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  boxShadow:
                    highlightTarget === "onboarding-project-list"
                      ? "0 0 0 6px rgba(59,130,246,0.12)"
                      : undefined,
                  transition: "all 0.25s ease",
                }}
              >
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    className={`projectBtn ${selectedProjectId === p.id ? "projectBtnActive" : ""}`}
                    onClick={() => {
                      // 🧠 ALWAYS save recent (works online + offline)
                      saveRecentProject({
                        id: p.id,
                        title: p.title,
                        client_name: p.client_name ?? null,
                        client_email: p.client_email ?? null,
                        client_phone: p.client_phone ?? null,
                        project_address: p.project_address ?? null,
                      });

                      saveRecentProject({
                        id: p.id,
                        title: p.title,
                        client_name: p.client_name ?? null,
                        client_email: p.client_email ?? null,
                        client_phone: p.client_phone ?? null,
                        project_address: p.project_address ?? null,
                      });

                      saveLastOpenProjectId(p.id);

                      // 🔌 OFFLINE MODE — load from cache ONLY
                      if (!navigator.onLine) {
                        const cached = loadCachedDashboardProject(p.id);

                        if (cached) {
                          setSelectedProject(cached.project);
                          setProofs(cached.proofs);
                          setApprovals(cached.approvals);
                          refreshOfflineProofs(cached.project.id);
                          refreshOfflineApprovals(cached.project.id);
                        } else {
                          setStatus("Project not available offline yet.");
                          return;
                        }
                      } else {
                        // 🌐 ONLINE — normal behavior
                        setSelectedProject(p);

                        cacheProjectSnapshot({ project: p, proofs: [], approvals: [] });

                        loadProofs(p.id, false, p);
                        loadApprovals(p.id, false, p);
                      }


                      // ✅ Only navigate when online
                      if (navigator.onLine) {
                        router.replace(`/dashboard?project=${p.id}`);
                      }

                      // 🧹 UI reset (same as before)
                      setOpenProofId(null);
                      setProjectMenuOpen(false);
                      setRenaming(false);
                      setRenameTitle(p.title || "");
                      setProofMenuOpenId(null);
                      setEditingProofId(null);
                      setEditDraftContent("");

                      scrollBackToOnboarding(700);
                    }}
                  >
                    <div style={{ display: "grid", gap: 2, textAlign: "left" }}>
                      <div>{p.title}</div>
                      {p.client_name || p.client_email || p.client_phone || p.project_address ? (
                        <div className="sub" style={{ opacity: 0.7, fontSize: 12 }}>
                          {[p.client_name, p.client_email, p.client_phone, p.project_address]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>

              {filteredProjects.length === 0 ? (
                <div className="sub" style={{ marginTop: 12, opacity: 0.75 }}>
                  No matching projects. Try searching by client name/email/phone.
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedProject && (
            <div className="card">
              <div
                style={{
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                {/* Top row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      opacity: 0.58,
                      paddingBottom: 6,
                      borderBottom: "1px solid rgba(15,23,42,0.32)",
                    }}
                  >
                    Active Project
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="btn"
                      onClick={() => {
                        if (isSendMode) {
                          setIsSendMode(false);
                          setSendCloseSignal((k) => k + 1);
                        } else if (isApprovalMode) {
                          setIsApprovalMode(false);
                        } else {
                          closeProjectView();
                        }
                      }}
                      title={
                        isSendMode
                          ? "Exit send mode"
                          : isApprovalMode
                            ? "Exit approval mode"
                            : "Close project view"
                      }
                    >
                      {isSendMode ? "Exit Send" : isApprovalMode ? "Exit Approval" : "Close"}
                    </button>

                    {!isSendMode ? (
                      <div style={{ position: "relative" }} ref={projectMenuRef}>
                        <button
                          id="approval-menu"
                          className="btn"
                          onClick={() => setProjectMenuOpen((v) => !v)}
                          title="Project actions"
                          style={{
                            boxShadow:
                              highlightTarget === "approval-menu"
                                ? "0 0 0 6px rgba(59,130,246,0.12)"
                                : undefined,
                            transition: "all 0.25s ease",
                          }}
                        >
                          …
                        </button>

                        {projectMenuOpen ? (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 44,
                              zIndex: 20,
                              width: 260,
                              maxWidth: "min(320px, calc(100vw - 24px))",
                              border: "1px solid rgba(15,23,42,0.12)",
                              borderRadius: 14,
                              background: "white",
                              padding: 10,
                              boxShadow: "0 12px 30px rgba(15,23,42,0.10)",
                              display: "grid",
                              gap: 8,
                              boxSizing: "border-box",
                              overflow: "hidden",
                            }}
                          >
                            {!renaming ? (
                              <>
                                <button
                                  className="btn"
                                  style={{ width: "100%" }}
                                  onClick={() => {
                                    setRenaming(true);
                                    setRenameTitle(selectedProject.title || "");
                                  }}
                                >
                                  Rename project
                                </button>

                                <button
                                  className="btn"
                                  style={{ width: "100%" }}
                                  onClick={exportProjectPdf}
                                >
                                  Download PDF
                                </button>

                                <button
                                  className="btn"
                                  style={{ width: "100%" }}
                                  onClick={exportDisputePackage}
                                >
                                  Export dispute package
                                </button>

                                <button
                                  className="btn"
                                  style={{
                                    width: "100%",
                                    background: "rgba(37,99,235,0.10)",
                                    color: "#1d4ed8",
                                    borderColor: "rgba(37,99,235,0.25)",
                                  }}
                                  onClick={() => {
                                    window.localStorage.removeItem(`approval-draft:${selectedProject.id}`);
                                    setEditingApproval(null);
                                    setIsApprovalMode(true);
                                    setProjectMenuOpen(false);
                                  }}
                                >
                                  Request Approval
                                </button>

                                <button
                                  className="btn btnDanger"
                                  style={{ width: "100%" }}
                                  onClick={archiveProject}
                                >
                                  Archive project
                                </button>
                              </>
                            ) : (
                              <div style={{ display: "grid", gap: 8 }}>
                                <div className="sub" style={{ opacity: 0.75 }}>
                                  Project name
                                </div>

                                <textarea
                                  ref={renameInputRef as any}
                                  value={renameTitle}
                                  onChange={(e) => setRenameTitle(e.target.value)}
                                  placeholder="Project name"
                                  style={{
                                    width: "100%",
                                    fontSize: 16,
                                    padding: "8px 12px",
                                    borderRadius: 10,
                                    border: "1px solid rgba(15,23,42,0.15)",
                                  }}
                                />

                                <div style={{ display: "flex", gap: 8 }}>
                                  <button className="btn btnPrimary" onClick={saveProjectRename}>
                                    Save
                                  </button>
                                  <button className="btn btnDanger" onClick={cancelRename}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Project title */}
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 26,
                    lineHeight: 1.2,
                    marginTop: 8,
                    wordBreak: "break-word",
                  }}
                >
                  {selectedProject.title}
                </div>
              </div>

              {!isSendMode ? (
                <div
                  id="client-info-section"
                  style={{
                    display: "grid",
                    gap: 10,
                    marginBottom: 12,
                    padding: highlightTarget === "client-info-section" ? 10 : 0,
                    borderRadius: 14,
                    boxShadow:
                      highlightTarget === "client-info-section"
                        ? "0 0 0 6px rgba(59,130,246,0.12)"
                        : undefined,
                    transition: "all 0.25s ease",
                  }}
                >
                  <div className="row" style={{ alignItems: "center" }}>
                    <div>
                      <div
                        style={{
                          display: "inline-block",
                          fontSize: 14,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          opacity: 0.58,
                          paddingBottom: 6,
                          borderBottom: "1px solid rgba(15,23,42,0.32)",
                          marginBottom: 8,
                        }}
                      >
                        Client
                      </div>

                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          opacity: 0.82,
                        }}
                      >
                        {clientSummary}
                      </div>
                    </div>

                    {!clientEditing ? (
                      <button className="btn" onClick={() => setClientEditing(true)}>
                        Edit
                      </button>
                    ) : null}
                  </div>

                  {!clientEditing && !selectedProject.client_email ? (
                    <div
                      className="sub"
                      style={{
                        opacity: 0.8,
                        marginTop: -4,
                      }}
                    >
                      Add client email to auto-fill send updates.
                    </div>
                  ) : null}

                  {clientEditing ? (
                    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                      <input
                        className="input"
                        placeholder="Client name (optional)"
                        value={clientNameDraft}
                        onChange={(e) => setClientNameDraft(e.target.value)}
                      />

                      <input
                        id="client-email-input"
                        className="input"
                        placeholder="Client email (optional)"
                        value={clientEmailDraft}
                        onChange={(e) => setClientEmailDraft(e.target.value)}
                      />

                      <input
                        className="input"
                        placeholder="Project address (optional)"
                        value={projectAddressDraft}
                        onChange={(e) => setProjectAddressDraft(e.target.value)}
                      />

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btnPrimary" onClick={saveClient}>
                          Save client
                        </button>
                        <button
                          className="btn btnDanger"
                          onClick={() => {
                            setClientNameDraft(selectedProject.client_name ?? "");
                            setClientEmailDraft(selectedProject.client_email ?? "");
                            setClientPhoneDraft(selectedProject.client_phone ?? "");
                            setProjectAddressDraft(selectedProject.project_address ?? "");
                            setClientEditing(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="sub" style={{ opacity: 0.65 }}>
                        Auto-fills send updates.
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                style={{
                  height: 1,
                  background: "rgba(15,23,42,0.08)",
                  margin: "16px 0",
                }}
              />

              <div
                id="onboarding-send-area"
                style={{
                  marginTop: 4,
                  marginBottom: 18,
                  padding: highlightTarget === "onboarding-send-area" ? 10 : 0,
                  borderRadius: 14,
                  boxShadow:
                    highlightTarget === "onboarding-send-area"
                      ? "0 0 0 6px rgba(59,130,246,0.12)"
                      : undefined,
                  transition: "all 0.25s ease",
                }}
              >
                {!isSendMode ? (
                  !isApprovalMode ? (
                    <button
                      className="btn"
                      onClick={() => {
                        setIsApprovalMode(false);
                        setIsSendMode(true);
                      }}
                      style={{
                        width: "100%",
                        background: "rgba(22,163,74,0.24)",
                        color: "#14532d",
                        borderColor: "rgba(22,163,74,0.48)",
                        fontWeight: 800,
                      }}
                    >
                      Send Project Update
                    </button>
                  ) : null
                ) : (
                  <>
                    <div
                      style={{
                        marginBottom: 10,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <button
                        className="btn"
                        onClick={() => setShowDeliveryHistory((v) => !v)}
                        title="Show or hide delivery history"
                        style={{
                          maxWidth: "100%",
                          whiteSpace: "normal",
                          textAlign: "center",
                        }}
                      >
                        {showDeliveryHistory ? "Hide Delivery History" : "Show Delivery History"}
                      </button>
                    </div>

                    {showDeliveryHistory ? (
                      <div style={{ marginBottom: 10 }}>
                        <DeliveryHistoryPanel projectId={selectedProject.id} />
                      </div>
                    ) : null}

                    <SendUpdatePack
                      projectId={selectedProject.id}
                      projectTitle={selectedProject.title}
                      clientName={selectedProject.client_name ?? undefined}
                      clientEmail={selectedProject.client_email ?? undefined}
                      clientPhone={selectedProject.client_phone ?? undefined}
                      entryCount={proofs.filter((p) => !p.locked_at && !p.deleted_at).length}
                      archivedEntryCount={proofs.filter((p) => !!p.deleted_at).length}
                      onSendSuccess={async () => {
                        finishOnboarding();
                        await loadProofs(selectedProject.id, showArchivedEntries);
                        setShowDeliveryHistory(true);
                        setIsSendMode(false);

                        setSendSuccessMessage("Your project timeline and PDF were sent successfully.");

                        setTimeout(() => {
                          setSendSuccessMessage("");
                        }, 5000);
                      }}
                    />
                  </>
                )}
              </div>

              {isApprovalMode && (
                <ApprovalComposer
                  projectId={selectedProject.id}
                  initialApproval={editingApproval}
                  onComplete={async () => {
                    window.localStorage.removeItem(`approval-draft:${selectedProject.id}`);
                    setIsApprovalMode(false);
                    setEditingApproval(null);
                    await loadApprovals(selectedProject.id);
                  }}
                />
              )}





              {!isSendMode && !isApprovalMode ? (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "rgba(15,23,42,0.08)",
                      margin: "18px 0 12px",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        opacity: 0.58,
                        paddingBottom: 6,
                        borderBottom: "1px solid rgba(15,23,42,0.32)",
                        marginBottom: 8,
                        marginRight: 6,
                      }}
                    >
                      Project Timeline
                    </div>

                    <button
                      className="btn"
                      onClick={() => {
                        const next = !showArchivedEntries;
                        setShowArchivedEntries(next);
                        loadProofs(selectedProject.id, next);
                        loadApprovals(selectedProject.id, next);
                      }}
                      title="Show/hide archived entries"
                    >
                      {showArchivedEntries ? "Hide archived" : "Show archived"}
                    </button>

                    <input
                      className="input"
                      placeholder="Search entries..."
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                      style={{ minWidth: 180, flex: "1 1 220px" }}
                    />

                    <select
                      className="input"
                      value={entrySortMode}
                      onChange={(e) => setEntrySortMode(e.target.value as any)}
                      style={{ width: 160, flex: "0 0 auto" }}
                      title="Sort entries"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>

                  <div
                    id="onboarding-entry-area"
                    style={{
                      display: "grid",
                      gap: 8,
                      marginTop: 6,
                      padding: highlightTarget === "onboarding-entry-area" ? 10 : 0,
                      borderRadius: 14,
                      boxShadow:
                        highlightTarget === "onboarding-entry-area"
                          ? "0 0 0 6px rgba(59,130,246,0.12)"
                          : undefined,
                      transition: "all 0.25s ease",
                    }}
                  >
                    <textarea
                      id="new-entry-textarea"
                      className={`textarea ${isTemplateText ? "templateText" : ""}`}
                      placeholder="Add update or note..."
                      value={newProofContent}
                      onChange={(e) => {
                        setNewProofContent(e.target.value);
                        setIsTemplateText(false);
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <button
                        type="button"
                        className={`btn ${showTemplates ? "btnDanger" : ""}`}
                        onClick={() => setShowTemplates((v) => !v)}
                      >
                        {showTemplates ? "Hide Templates" : "⚡ Quick Templates"}
                      </button>
                    </div>

                    {showTemplates ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {entryTemplates.map((template) => (
                          <button
                            key={template.name}
                            type="button"
                            className="btn"
                            onClick={() => {
                              setNewProofContent(template.text);
                              setIsTemplateText(true);
                              setShowTemplates(false);

                              setTimeout(() => {
                                const el = document.getElementById("new-entry-textarea") as HTMLTextAreaElement | null;
                                el?.focus();
                              }, 50);
                            }}
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <button
                      className="btn"
                      onClick={addProof}
                      disabled={addingProof}
                      style={{
                        background: "rgba(15,23,42,0.14)",
                        color: "#020617",
                        borderColor: "rgba(15,23,42,0.28)",
                        fontWeight: 700,
                      }}
                    >
                      {addingProof ? "Saving..." : "Add Entry"}
                    </button>

                    {proofStatus ? (
                      <div className="sub" style={{ opacity: 0.85 }}>
                        {proofStatus}
                      </div>
                    ) : null}
                  </div>

                  {draftApprovals.length > 0 ? (
                    <div className="list" style={{ marginTop: 14, display: "grid", gap: 14 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                          opacity: 0.65,
                        }}
                      >
                        Draft Approvals
                      </div>

                      {draftApprovals.map((approval) => (
                        <ApprovalCard
                          key={approval.id}
                          approval={approval}
                          onUpdated={async () => {
                            await loadApprovals(selectedProject.id);
                          }}
                          onEdit={(approval) => {
                            setEditingApproval(approval);
                            setIsApprovalMode(true);
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  {approvals.filter((a) => a.status !== "draft").length > 0 ? (
                    <div className="list" style={{ marginTop: 14, display: "grid", gap: 14 }}>
                      {approvals
                        .filter((a) => a.status !== "draft")
                        .map((approval) => (
                          <ApprovalCard
                            key={approval.id}
                            approval={approval}
                            onUpdated={async () => {
                              await loadApprovals(selectedProject.id);
                            }}
                          />
                        ))}
                    </div>
                  ) : null}

                  <div className="list" style={{ marginTop: 14, display: "grid", gap: 14 }}>
                    {filteredProofs.map((proof) => {
                      const offline = isOfflineProof(proof);
                      const serverProof = offline ? null : proof;
                      const isOpen = openProofId === proof.id;
                      const isLocked = offline ? false : !!proof.locked_at;
                      const isArchived = offline ? false : isArchivedProof(proof);
                      const working = !offline && workingProofId === proof.id;
                      const isEditing = !offline && editingProofId === proof.id;

                      return (
                        <div
                          key={offline ? proof.id : proof.id}
                          className="proofItem"
                          style={{
                            border: isArchived
                              ? "1px solid rgba(239,68,68,0.18)"
                              : isLocked
                                ? "1px solid rgba(16,185,129,0.18)"
                                : "1px solid rgba(15,23,42,0.12)",
                            borderLeft: isArchived
                              ? "6px solid #f87171"
                              : isLocked
                                ? "6px solid #10b981"
                                : "6px solid #f59e0b",
                            borderRadius: 18,
                            padding: 18,
                            background: isArchived
                              ? "rgba(248,250,252,0.9)"
                              : "rgba(255,255,255,0.98)",
                            boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
                            opacity: isArchived ? 0.9 : 1,
                            position: "relative",
                            zIndex: !offline && proofMenuOpenId === proof.id ? 50 : 1,
                          }}
                        >
                          <div className="row" style={{ alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              {isEditing ? (
                                <div style={{ display: "grid", gap: 8 }}>
                                  <textarea
                                    className="textarea"
                                    value={editDraftContent}
                                    onChange={(e) => setEditDraftContent(e.target.value)}
                                  />
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button
                                      className="btn btnPrimary"
                                      onClick={() => saveEditEntry(proof.id)}
                                      disabled={working}
                                    >
                                      {working ? "Saving..." : "Save changes"}
                                    </button>
                                    <button className="btn btnDanger" onClick={cancelEditEntry} disabled={working}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: 15,
                                    lineHeight: 1.4,
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    minWidth: 0,
                                    maxWidth: "100%",
                                  }}
                                >
                                  {proof.content.split("\n").map((line, index) => (
                                    <div
                                      key={index}
                                      style={{
                                        fontWeight: index === 0 ? 700 : 400,
                                        marginBottom: index === 0 ? 6 : 0,
                                        overflowWrap: "anywhere",
                                        wordBreak: "break-word",
                                        minWidth: 0,
                                        maxWidth: "100%",
                                      }}
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginTop: 14,
                                  paddingTop: 12,
                                  borderTop: "1px solid rgba(15,23,42,0.08)",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div className="sub" style={{ opacity: 0.75 }}>
                                  {formatWhen(offline ? proof.createdAt : proof.created_at)}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border: isArchived
                                      ? "1px solid rgba(239,68,68,0.35)"
                                      : isLocked
                                        ? "1px solid rgba(16,185,129,0.35)"
                                        : "1px solid rgba(245,158,11,0.35)",
                                    background: isArchived
                                      ? "rgba(239,68,68,0.08)"
                                      : isLocked
                                        ? "rgba(16,185,129,0.08)"
                                        : "rgba(245,158,11,0.08)",
                                    color: isArchived ? "#991b1b" : isLocked ? "#065f46" : "#92400e",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {offline
                                    ? "Pending Sync"
                                    : isArchived
                                      ? isLocked
                                        ? "Archived Finalized"
                                        : "Archived Draft"
                                      : isLocked
                                        ? "Finalized"
                                        : "Draft"}
                                </div>
                              </div>

                              {isArchived ? (
                                <div className="sub" style={{ marginTop: 8, opacity: 0.72 }}>
                                  Hidden from normal timeline view
                                </div>
                              ) : null}
                            </div>

                            <button
                              className="btn"
                              onClick={() => {
                                setProofMenuOpenId(null);
                                setOpenProofId(isOpen ? null : proof.id);
                              }}
                              disabled={isEditing}
                            >
                              {isOpen ? "Hide" : "View"}
                            </button>

                            <div
                              style={{ position: "relative" }}
                              ref={!offline && proofMenuOpenId === proof.id ? proofMenuRef : null}
                            >
                              <button
                                className="btn"
                                onClick={() => setProofMenuOpenId((v) => (v === proof.id ? null : proof.id))}
                                title="Entry actions"
                                disabled={isEditing || offline}
                              >
                                …
                              </button>

                              {!offline && proofMenuOpenId === proof.id ? (
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
                                  {!isLocked ? (
                                    <button
                                      className="btn"
                                      onClick={() => {
                                        if (!serverProof) return;
                                        startEditEntry(serverProof);
                                      }}
                                      disabled={working}
                                    >
                                      Edit
                                    </button>
                                  ) : null}

                                  {isArchived ? (
                                    <button
                                      className="btn"
                                      onClick={() => {
                                        if (!serverProof) return;
                                        restoreEntry(serverProof.id);
                                      }}
                                      disabled={working}
                                    >
                                      {working ? "Working..." : "Restore"}
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btnDanger"
                                      onClick={() => {
                                        if (offline) return;
                                        archiveEntry(proof.id);
                                      }}
                                      disabled={working}
                                    >
                                      {working ? "Working..." : "Archive"}
                                    </button>
                                  )}

                                  {!isLocked ? (
                                    <button
                                      className="btn btnDanger"
                                      onClick={() => {
                                        if (!serverProof) return;
                                        deleteEntry(serverProof.id);
                                      }}
                                      disabled={working}
                                    >
                                      {working ? "Working..." : "Delete"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {isOpen ? (
                            <div
                              id="onboarding-attachments-area"
                              style={{
                                marginTop: 14,
                                padding: 14,
                                borderRadius: 14,
                                border: "1px dashed rgba(15,23,42,0.12)",
                                background: "rgba(15,23,42,0.02)",
                                boxShadow:
                                  highlightTarget === "onboarding-attachments-area"
                                    ? "0 0 0 6px rgba(59,130,246,0.12)"
                                    : undefined,
                                transition: "all 0.25s ease",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  letterSpacing: 0.5,
                                  textTransform: "uppercase",
                                  opacity: 0.55,
                                  marginBottom: 10,
                                }}
                              >
                                Attachments
                              </div>

                              <ProofAttachmentsWrapper
                                projectId={selectedProject.id}
                                proofId={serverProof?.id}
                                offlineProofId={offline ? proof.id : undefined}
                                lockedAt={serverProof?.locked_at}
                                refreshKey={attachmentsRefreshKey}
                                onUploaded={() => {
                                  setAttachmentsRefreshKey((k) => k + 1);
                                  setShowAttachmentStep(false);
                                  scrollBackToOnboarding(700);
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {filteredProofs.length === 0 ? (
                    <div className="sub" style={{ marginTop: 14, opacity: 0.75 }}>
                      No entries yet. Add your first update above to start the project timeline.
                    </div>
                  ) : null}

                  <div style={{ marginTop: 18, fontSize: 12, opacity: 0.6 }}>
                    Draft entries become finalized when they are included in a sent project update.
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}