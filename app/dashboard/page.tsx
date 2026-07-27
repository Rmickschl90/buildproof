"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Capacitor, registerPlugin } from "@capacitor/core";

type PdfSaverPlugin = {
  savePdf(options: {
    fileName: string;
    exportUrl: string;
    accessToken: string;
    projectId: string;
    reportMode: "standard" | "dispute";
  }): Promise<{ saved: boolean; uri?: string }>;
};

const PdfSaver = registerPlugin<PdfSaverPlugin>("PdfSaver");

import OnboardingWizard from "../components/OnboardingWizard";
import SendUpdateModal from "../components/SendUpdateModal";
import ProofAttachmentsWrapper from "../components/ProofAttachmentsWrapper";
import ApprovalComposer from "../components/ApprovalComposer";
import ApprovalCard from "../components/ApprovalCard";
import ThemeToggle from "../components/ThemeToggle";
import NewProjectModal from "../components/NewProjectModal";
import {
  createOfflineProof,
  listOfflineProofsForProject,
  remapOfflineProofProjectId,
  type OfflineProofRecord,
} from "@/lib/offlineProofOutbox";
import { remapOfflineAttachmentProjectId } from "@/lib/offlineAttachmentOutbox";
import {
  listOfflineApprovalsForProject,
  remapOfflineApprovalProjectId,
  type OfflineApprovalRecord,
} from "@/lib/offlineApprovalOutbox";
import {
  createOfflineProjectId,
  getAllOfflineProjects,
  putOfflineProject,
  removeOfflineProject,
  updateOfflineProject,
  type OfflineProjectRecord,
} from "@/lib/offlineProjectOutbox";
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
import { saveCachedAttachments, loadCachedAttachments } from "@/lib/offlineAttachmentCache";

type Project = {
  id: string;
  title: string;
  user_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  project_address: string | null;
  private_notes?: string | null;
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
  created_timezone_id?: string | null;
  created_timezone_offset_minutes?: number | null;
};

type ApprovalLineItem = {
  description: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
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
  created_timezone_id?: string | null;
  created_timezone_offset_minutes?: number | null;
  // Estimate/Change Order system (Phase 2+): optional so every code path that
  // builds an approval-shaped object without them (e.g. the offline-approval
  // normalization in buildVisibleApprovals) keeps compiling unchanged.
  is_baseline?: boolean;
  line_items?: ApprovalLineItem[];
};

type TimelineApproval = Approval;

type TimelineProof = Proof | (OfflineProofRecord & { isOffline: true });

function formatWhen(
  iso: string,
  timezoneOffsetMinutes?: number | null
) {
  try {
    const utc = new Date(iso);

    if (
      typeof timezoneOffsetMinutes === "number" &&
      !Number.isNaN(timezoneOffsetMinutes)
    ) {
      const wallClock = new Date(
        utc.getTime() - timezoneOffsetMinutes * 60000
      );

      return wallClock.toLocaleString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return utc.toLocaleString();
  } catch {
    return iso;
  }
}

function getCurrentTimezoneSnapshot() {
  const now = new Date();

  return {
    created_timezone_id:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
        : null,
    created_timezone_offset_minutes: now.getTimezoneOffset(),
  };
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

async function waitForSupabaseReconnectReady() {
  const maxAttempts = 10;
  const delayMs = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    try {
      const { error } = await supabase
        .from("projects")
        .select("id")
        .limit(1);

      if (!error) return true;
    } catch {
      // keep retrying
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

const LAST_OPEN_PROJECT_KEY = "Leeward_last_open_project_id";

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

function getInitialCachedProjectSnapshot() {
  if (typeof window === "undefined") return null;

  const projectIdFromUrl = new URLSearchParams(window.location.search).get("project");
  const restoreProjectId = projectIdFromUrl || getLastOpenProjectId();
  if (!restoreProjectId) return null;

  return loadCachedDashboardProject(restoreProjectId);
}

export default function DashboardPage() {
  const router = useRouter();


  // ---------------- AUTH ----------------
  const [userId, setUserId] = useState<string | null>(() => {
    const cached = getInitialCachedProjectSnapshot();
    return cached?.project.user_id ?? null;
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgContext, setOrgContext] = useState<{
    organizationId: string | null;
    organizationName?: string;
    role?: "owner" | "member";
  } | null>(null);
  // Which billing plan is actually active right now (not just "does an org
  // membership row exist"). A dissolved-but-not-deleted org owner still has an
  // org membership row, but no active org subscription -- billingSource is
  // what actually gates whether the header shows "Invite Team" vs "Upgrade".
  const [billingSource, setBillingSource] = useState<
    "individual" | "organization" | null
  >(null);

  // ---- Members / Invite panel ----
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [orgMembers, setOrgMembers] = useState<
    Array<{ id: string; user_id: string; role: string; joined_at: string; email: string | null }>
  >([]);
  const [orgPendingInvites, setOrgPendingInvites] = useState<
    Array<{ id: string; email: string; expires_at: string }>
  >([]);
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [memberActionBusyId, setMemberActionBusyId] = useState<string | null>(null);
  const [dissolveConfirmOpen, setDissolveConfirmOpen] = useState(false);
  const [dissolveConfirmName, setDissolveConfirmName] = useState("");
  const [dissolveBusy, setDissolveBusy] = useState(false);
  const [dissolveError, setDissolveError] = useState("");

  // ---- Upgrade to Team panel ----
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTeamName, setUpgradeTeamName] = useState("");
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  // ---------------- DATA ----------------
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(() => {
    const cached = getInitialCachedProjectSnapshot();
    return cached?.project ?? null;
  });
  function setSelectedProjectWithTrace(
    next: Project | null,
    reason: string
  ) {
    console.log("🧱 setSelectedProjectWithTrace:", {
      reason,
      next,
      stack: new Error().stack,
    });

    setSelectedProject(next);
  }
  const [proofs, setProofs] = useState<Proof[]>(() => {
    const cached = getInitialCachedProjectSnapshot();
    return cached?.proofs ?? [];
  });
  const [approvals, setApprovals] = useState<Approval[]>(() => {
    const cached = getInitialCachedProjectSnapshot();
    return cached?.approvals ?? [];
  });
  const [offlineProjects, setOfflineProjects] = useState<OfflineProjectRecord[]>([]);
  const [offlineApprovals, setOfflineApprovals] = useState<OfflineApprovalRecord[]>([]);
  const [offlineProofs, setOfflineProofs] = useState<OfflineProofRecord[]>([]);
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    console.log("🧱 isBrowserOnline changed:", isBrowserOnline);
  }, [isBrowserOnline]);
  const isFlushingOfflineProofsRef = useRef(false);
  const isRunningReconnectRef = useRef(false);
  const selectedProjectId = selectedProject ? selectedProject.id : null;
  const [editingApproval, setEditingApproval] = useState<any | null>(null);
  // Set right before opening ApprovalComposer for a brand-new estimate/change
  // order from the Estimate tab's adaptive "+" button -- decides whether that
  // fresh composer instance defaults to "this is the baseline estimate".
  const [approvalComposerDefaultBaseline, setApprovalComposerDefaultBaseline] =
    useState(false);
  // Scroll target for the Estimate tab's floating "+" button -- the composer
  // renders below the fold when opened from a scrolled-down position, so the
  // click needs to bring its first field into view rather than just toggling
  // isApprovalMode and leaving the user staring at wherever they already were.
  const approvalComposerRef = useRef<HTMLDivElement | null>(null);
  const [shareInvoiceStatus, setShareInvoiceStatus] = useState("");

  // Phase 7 Timeline redesign: the "Add entry" composer (textarea + template
  // picker + Add Entry button) is now hidden behind a floating "+" FAB
  // (mirroring the Estimate tab's own FAB/isApprovalMode pattern) instead of
  // always sitting open at the top of the timeline. addEntryRef is the same
  // scroll-into-view target pattern as approvalComposerRef above.
  const [isAddEntryMode, setIsAddEntryMode] = useState(false);
  const addEntryRef = useRef<HTMLDivElement | null>(null);


  // ---------------- INPUTS ----------------
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
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

  // ---- Timeline content-type / status filtering ----
  const [entryContentFilter, setEntryContentFilter] = useState<
    "all" | "notes" | "photos" | "files"
  >("all");
  const [entryStatusFilter, setEntryStatusFilter] = useState<
    "all" | "draft" | "finalized" | "archived"
  >("all");
  // Consolidated Timeline filter panel -- replaces the separate content-type
  // chip row / status dropdown / sort+archived row with a single "Filter"
  // button + popover (search stays visible on its own, everything else moves
  // in here) to cut down on visual clutter above the entry list.
  const [entryFilterMenuOpen, setEntryFilterMenuOpen] = useState(false);
  const entryFilterMenuRef = useRef<HTMLDivElement | null>(null);

  function getProofContentKind(proof: TimelineProof): "notes" | "photos" | "files" {
    if (isOfflineProof(proof)) return "notes";

    const cached = loadCachedAttachments(proof.id);
    if (!cached || cached.length === 0) return "notes";

    const hasImage = cached.some((a) => (a.mime_type || "").startsWith("image/"));
    const hasOther = cached.some((a) => !(a.mime_type || "").startsWith("image/"));

    if (hasImage && !hasOther) return "photos";
    if (hasOther && !hasImage) return "files";
    return hasImage ? "photos" : "files";
  }

  function getProofStatusKind(proof: TimelineProof): "draft" | "finalized" | "archived" {
    if (isOfflineProof(proof)) return "draft";
    if (proof.deleted_at) return "archived";
    if (proof.locked_at) return "finalized";
    return "draft";
  }

  // ---- Global navigation (Projects / Account) ----
  const [activeGlobalTab, setActiveGlobalTab] = useState<"projects" | "account">("projects");

  // ---- Project-level navigation (Timeline / Estimate) ----
  const [activeProjectTab, setActiveProjectTab] = useState<"timeline" | "estimate">("timeline");

  useEffect(() => {
    setActiveProjectTab("timeline");
    setShareInvoiceStatus("");
    setIsAddEntryMode(false);
  }, [selectedProject?.id]);

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

  // ---- Project notes ----
  // ---- Project notes ----
  const [projectNotesOpen, setProjectNotesOpen] = useState(false);
  const [projectNotesDraft, setProjectNotesDraft] = useState("");
  const projectNotesSaveTimerRef = useRef<number | null>(null);

  // ---- Project menu ----
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Account menu (header dropdown -- Theme/Help/Manage Billing, replaces
  // the old standalone "Account" tab now that the Projects/Account pill bar
  // has been removed) ----
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

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
  const [hasMounted, setHasMounted] = useState(false);
  function cacheProjectSnapshot(args: {
    project?: Project | null;
    proofs?: Proof[];
    approvals?: Approval[];
  }) {
    const project = args.project ?? selectedProject;
    if (!project?.id) return;

    const nextProofs = Array.isArray(args.proofs) ? args.proofs : proofs;
    const nextApprovals = Array.isArray(args.approvals) ? args.approvals : approvals;

    saveCachedDashboardProject({
      project,
      proofs: nextProofs,
      approvals: nextApprovals,
      cachedAt: new Date().toISOString(),
    });
  }

  useEffect(() => {
    if (!selectedProject) return;

    const projectId = selectedProject.id;

    const existingRaw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`buildproof-dashboard-cache:${projectId}`)
        : null;

    let existingProofCount = 0;

    try {
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        existingProofCount = parsed?.proofs?.length ?? 0;
      }
    } catch { }

    // 🚨 BLOCK ALL empty writes for server projects
    const isServerProject = !selectedProject.id.startsWith("offline-project-");

    if (isServerProject && proofs.length === 0) {
      console.log("🛑 BLOCKED EMPTY CACHE WRITE", {
        projectId,
      });
      return;
    }

    console.log("🧱 CACHE WRITE", {
      projectId,
      projectTitle: selectedProject.title,
      proofCount: proofs.length,
      approvalCount: approvals.length,
    });

    saveCachedDashboardProject({
      project: selectedProject,
      proofs,
      approvals,
      cachedAt: new Date().toISOString(),
    });
  }, [selectedProject, proofs, approvals]);

  useEffect(() => {
    const existing = JSON.parse(
      window.localStorage.getItem("Leeward_selected_project_debug_log") || "[]"
    );

    existing.push(
      selectedProject
        ? { id: selectedProject.id, title: selectedProject.title }
        : null
    );

    window.localStorage.setItem(
      "Leeward_selected_project_debug_log",
      JSON.stringify(existing)
    );
  }, [selectedProject]);

  useEffect(() => {
    console.log("🧱 selectedProject changed:", selectedProject);
  }, [selectedProject]);


  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Bring the approval composer's first field into view when it opens --
  // the Estimate tab's floating "+" button is the only trigger for this now
  // (the old Timeline "Request Approval" button was removed once the "+"
  // button existed to replace it), but the composer can still open while the
  // page is scrolled well past where it renders.
  useEffect(() => {
    if (isApprovalMode) {
      approvalComposerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isApprovalMode]);

  // Same pattern for the Timeline tab's "Add entry" FAB.
  useEffect(() => {
    if (isAddEntryMode) {
      addEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isAddEntryMode]);

  useEffect(() => {
    return () => {
      if (projectNotesSaveTimerRef.current) {
        window.clearTimeout(projectNotesSaveTimerRef.current);
      }
    };
  }, []);

  // ---------------- AUTH BOOT ----------------
  useEffect(() => {
    (async () => {
      try {
        const projectIdFromUrl = new URLSearchParams(window.location.search).get("project");
        const restoreProjectId = projectIdFromUrl || getLastOpenProjectId();

        if (isOffline()) {
          console.log("🧱 OFFLINE BOOT PATH");

          await refreshOfflineProjects();

          // 🔍 DEBUG — confirm recent projects cache
          const recent = getRecentProjects();
          console.log("🧱 Offline recent projects:", recent);
          setProjects(recent as any);

          if (restoreProjectId) {
            const cached = loadCachedDashboardProject(restoreProjectId);
            console.log("🧱 restoreProjectId:", restoreProjectId);
            console.log("🧱 cached project found:", !!cached, cached);

            if (cached) {
              const debugSteps: string[] = [];
              debugSteps.push("found cached project");
              debugSteps.push(`project id: ${cached.project.id}`);
              debugSteps.push(`project title: ${cached.project.title}`);

              setSelectedProjectWithTrace(cached.project, "offline boot restore");
              debugSteps.push("setSelectedProject done");

              setProofs(cached.proofs);
              debugSteps.push(`setProofs done (${cached.proofs.length})`);

              setApprovals(cached.approvals);
              debugSteps.push(`setApprovals done (${cached.approvals.length})`);

              setUserId(cached.project.user_id);
              debugSteps.push("setUserId done");

              saveLastOpenProjectId(cached.project.id);
              debugSteps.push("saveLastOpenProjectId done");

              window.localStorage.setItem(
                "Leeward_offline_boot_debug",
                JSON.stringify(debugSteps)
              );

              await refreshOfflineProofs(cached.project.id);
              debugSteps.push("refreshOfflineProofs done");

              await refreshOfflineApprovals(cached.project.id);
              debugSteps.push("refreshOfflineApprovals done");

              setDashboardReady(true);

              debugSteps.push("setDashboardReady done");

              window.localStorage.setItem(
                "Leeward_offline_boot_debug",
                JSON.stringify(debugSteps)
              );
            } else {
              clearLastOpenProjectId();
            }
          }

          const done = window.localStorage.getItem("Leeward_onboarding_complete");
          if (done === "true") {
            setOnboardingComplete(true);
          }

          return;
        }

        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          const message = String(error?.message || "").toLowerCase();

          const looksOffline =
            !navigator.onLine ||
            message.includes("failed to fetch") ||
            message.includes("network") ||
            message.includes("fetch");

          if (looksOffline) {
            return;
          }

          router.push("/login");
          return;
        }

        setUserId(data.user.id);
        setUserEmail(data.user.email ?? null);

        const { data: billingSessionData } = await supabase.auth.getSession();
        const billingAccessToken = billingSessionData.session?.access_token;

        if (!billingAccessToken) {
          router.replace("/login");
          return;
        }

        const billingRes = await fetch("/api/billing/status", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${billingAccessToken}` },
        });

        if (!billingRes.ok) {
          router.replace("/subscribe");
          return;
        }

        const billing = await billingRes.json();

        if (billing?.status !== "active" && billing?.status !== "trialing") {
          router.replace("/subscribe");
          return;
        }

        setBillingSource(billing?.source ?? null);

        void refreshOrgContext(billingAccessToken);

        await refreshOfflineProjects();
        await flushOfflineProofs();
        await loadActiveProjects(data.user.id);

        if (projectIdFromUrl) {
          const { data: project } = await supabase
            .from("projects")
            .select("*")
            .eq("id", projectIdFromUrl)
            .single();

          if (project) {
            setSelectedProjectWithTrace(project, "online boot restore from projectIdFromUrl");


            await loadProofs(project.id, false, project);
            await loadApprovals(project.id, false, project);
          }
        }

        const done = window.localStorage.getItem("Leeward_onboarding_complete");
        if (done === "true") {
          setOnboardingComplete(true);
        }
      } finally {
        setDashboardReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleConnectionChange() {
      console.log("🧱 handleConnectionChange", {
        navigatorOnline: navigator.onLine,
      });

      setIsBrowserOnline(navigator.onLine);
    }

    function handleVisibilityOrFocus() {
      console.log("🧱 handleVisibilityOrFocus", {
        navigatorOnline: navigator.onLine,
        visibilityState: document.visibilityState,
      });

      setIsBrowserOnline(navigator.onLine);
    }

    window.addEventListener("online", handleConnectionChange);
    window.addEventListener("offline", handleConnectionChange);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("online", handleConnectionChange);
      window.removeEventListener("offline", handleConnectionChange);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  useEffect(() => {
    let lastOnlineState = navigator.onLine;

    const interval = setInterval(() => {
      const current = navigator.onLine;

      if (current !== lastOnlineState) {
        console.log("🧱 POLL detected online change:", current);

        lastOnlineState = current;
        setIsBrowserOnline(current);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  async function refreshOrgContext(token: string) {
    try {
      const res = await fetch("/api/auth/context", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const json = await res.json();
      setOrgContext(json);
    } catch {
      // non-critical - display-only, safe to skip on failure
    }
  }

  async function checkBillingOnReconnect(token: string) {
    try {
      const res = await fetch("/api/billing/status", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const json = await res.json();

      setBillingSource(json?.source ?? null);

      if (json?.status !== "active" && json?.status !== "trialing") {
        setProofStatus(
          "Your subscription is no longer active — some features may be limited until billing is resolved. Visit Subscribe to renew."
        );
      }
    } catch {
      // non-critical - a failed check here shouldn't falsely warn the user;
      // the existing boot-time billing gate remains the authoritative check
    }
  }

  async function getAuthToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }

  async function openMembersPanel() {
    setMembersOpen(true);
    setMembersError("");
    setInviteError("");
    setDissolveConfirmOpen(false);
    setDissolveConfirmName("");
    setDissolveError("");
    await loadMembersAndInvites();
  }

  async function loadMembersAndInvites() {
    setMembersLoading(true);
    setMembersError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setMembersError("Not signed in.");
        return;
      }

      const res = await fetch("/api/organization/members", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();

      if (!res.ok) {
        setMembersError(json?.error || "Failed to load members.");
        return;
      }

      setOrgMembers(json.members ?? []);
      setOrgPendingInvites(json.invites ?? []);
    } catch (e: any) {
      setMembersError(e?.message || "Failed to load members.");
    } finally {
      setMembersLoading(false);
    }
  }

  async function sendInvite() {
    const email = inviteEmailDraft.trim();
    if (!email) return;

    setInviteSending(true);
    setInviteError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setInviteError("Not signed in.");
        return;
      }

      const res = await fetch("/api/organization/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();

      if (!res.ok) {
        setInviteError(json?.error || "Failed to send invite.");
        return;
      }

      setInviteEmailDraft("");
      await loadMembersAndInvites();
    } catch (e: any) {
      setInviteError(e?.message || "Failed to send invite.");
    } finally {
      setInviteSending(false);
    }
  }

  async function revokeInvite(id: string) {
    setMemberActionBusyId(id);
    setMembersError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setMembersError("Not signed in.");
        return;
      }

      const res = await fetch(`/api/organization/invites/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();

      if (!res.ok) {
        setMembersError(json?.error || "Failed to revoke invite.");
        return;
      }

      await loadMembersAndInvites();
    } catch (e: any) {
      setMembersError(e?.message || "Failed to revoke invite.");
    } finally {
      setMemberActionBusyId(null);
    }
  }

  async function removeOrgMember(memberRowId: string) {
    setMemberActionBusyId(memberRowId);
    setMembersError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setMembersError("Not signed in.");
        return;
      }

      const res = await fetch(`/api/organization/members/${memberRowId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();

      if (!res.ok) {
        setMembersError(json?.error || "Failed to remove member.");
        return;
      }

      await loadMembersAndInvites();
    } catch (e: any) {
      setMembersError(e?.message || "Failed to remove member.");
    } finally {
      setMemberActionBusyId(null);
    }
  }

  async function confirmDissolveOrganization() {
    if (!orgContext?.organizationName) return;

    setDissolveBusy(true);
    setDissolveError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setDissolveError("Not signed in.");
        return;
      }

      const res = await fetch("/api/organization/dissolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmName: dissolveConfirmName.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setDissolveError(json?.error || "Failed to cancel team.");
        return;
      }

      setMembersOpen(false);
      setDissolveConfirmOpen(false);
      setDissolveConfirmName("");
      router.replace("/subscribe");
    } catch (e: any) {
      setDissolveError(e?.message || "Failed to cancel team.");
    } finally {
      setDissolveBusy(false);
    }
  }

  function openUpgradePanel() {
    setUpgradeOpen(true);
    setUpgradeError("");
    setUpgradeTeamName("");
  }

  async function submitUpgrade() {
    setUpgradeSubmitting(true);
    setUpgradeError("");

    try {
      const token = await getAuthToken();
      if (!token) {
        setUpgradeError("Not signed in.");
        return;
      }

      // A dormant former-owner (dissolved a team previously, but their
      // organization_members/organizations rows still exist per the
      // dissolve route's design) already has an org context. In that case,
      // skip organization/create (it would 409) and resume billing on the
      // same org directly.
      if (!orgContext?.organizationId) {
        const name = upgradeTeamName.trim();
        if (!name) {
          setUpgradeError("Enter a team name.");
          return;
        }

        const createRes = await fetch("/api/organization/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name }),
        });

        const createJson = await createRes.json();

        if (!createRes.ok) {
          setUpgradeError(createJson?.error || "Failed to create organization.");
          return;
        }
      }

      const checkoutRes = await fetch("/api/billing/team-checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const checkoutJson = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutJson?.url) {
        setUpgradeError(checkoutJson?.error || "Failed to start checkout.");
        return;
      }

      window.location.href = checkoutJson.url;
    } catch (e: any) {
      setUpgradeError(e?.message || "Failed to start checkout.");
    } finally {
      setUpgradeSubmitting(false);
    }
  }

  async function runReconnectFlow() {
    if (isRunningReconnectRef.current) {
      console.log("🧱 RECONNECT SKIPPED - already running");
      return;
    }

    isRunningReconnectRef.current = true;

    try {
      console.log("🧱 RECONNECT STEP 1 - entered async block");

      if (!navigator.onLine) return;
      if (!selectedProject?.id) return;

      const reconnectReady = await waitForSupabaseReconnectReady();
      if (!reconnectReady) return;

      const startedWithProjectId = selectedProject.id;
      const startedWithOfflineProject =
        startedWithProjectId.startsWith("offline-project-");

      await syncOfflineProjects();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("buildproof-data-changed"));
      }

      console.log("🧱 RECONNECT STEP 2 - finished syncOfflineProjects");

      const reconnectProjectId = startedWithOfflineProject
        ? getLastOpenProjectId() || startedWithProjectId
        : startedWithProjectId;

      console.log("🧱 RECONNECT STEP 3 - resolved reconnectProjectId", {
        startedWithProjectId,
        reconnectProjectId,
      });

      await refreshOfflineProofs(reconnectProjectId);
      await refreshOfflineApprovals(reconnectProjectId);
      console.log("🧱 RECONNECT STEP 4 - finished refreshOfflineApprovals");

      setProofStatus("Connection restored — syncing offline entries...");
      console.log("🧱 RECONNECT STEP 5 - set proof status");

      const { flushOfflineApprovalOutbox } = await import(
        "@/lib/offlineApprovalFlush"
      );

      await flushOfflineProofs();



      const getAccessToken = async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) throw new Error("Not logged in");
        return token;
      };

      void refreshOrgContext(await getAccessToken());
      void checkBillingOnReconnect(await getAccessToken());

      await flushOfflineApprovalOutbox(getAccessToken);

      const { flushOfflineSendOutbox } = await import(
        "@/lib/offlineSendFlush"
      );

      await flushOfflineSendOutbox({
        getAccessToken,
      });

      const { flushOfflineApprovalAttachmentOutbox } = await import(
        "@/lib/offlineApprovalAttachmentFlush"
      );
      const { flushOfflineApprovalSendOutbox } = await import(
        "@/lib/offlineApprovalSendFlush"
      );

      await flushOfflineApprovalAttachmentOutbox(getAccessToken);
      await flushOfflineApprovalSendOutbox(getAccessToken);

      if (!reconnectProjectId.startsWith("offline-project-")) {
        await loadProofs(reconnectProjectId, showArchivedEntries);
        await loadApprovals(reconnectProjectId, showArchivedEntries);
      }

      await refreshOfflineProofs(reconnectProjectId);
      await refreshOfflineApprovals(reconnectProjectId);
    } finally {
      isRunningReconnectRef.current = false;
    }
  }

  useEffect(() => {
    console.log("🧱 RECONNECT EFFECT FIRED", {
      isBrowserOnline,
      selectedProjectId: selectedProject?.id,
    });

    if (!navigator.onLine) return;
    if (!selectedProject?.id) return;

    void runReconnectFlow();
  }, [isBrowserOnline, selectedProject?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => {
      if (!navigator.onLine) return;
      if (!selectedProject?.id) return;

      console.log("🧱 GLOBAL RECONNECT HANDLER FIRED");
      void runReconnectFlow();
    };

    window.addEventListener("buildproof-run-reconnect-flow", handler);

    return () => {
      window.removeEventListener("buildproof-run-reconnect-flow", handler);
    };
  }, [selectedProject?.id]);



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
    setProjectNotesDraft(selectedProject.private_notes ?? "");

    const hasAnyClient =
      !!(selectedProject.client_name && selectedProject.client_name.trim()) ||
      !!(selectedProject.client_email && selectedProject.client_email.trim()) ||
      !!(selectedProject.client_phone && selectedProject.client_phone.trim());

    setClientEditing(!hasAnyClient);

    setProjectMenuOpen(false);
    setProjectNotesOpen(false);
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

      void refreshOfflineProjects();

      if (!selectedProject?.id) return;

      if (!navigator.onLine) {
        void refreshOfflineProofs(selectedProject.id);
        void refreshOfflineApprovals(selectedProject.id);
        return;
      }

      void loadProofs(selectedProject.id, showArchivedEntries);
      void loadApprovals(selectedProject.id, showArchivedEntries);
    }

    function handleOfflineApprovalSyncComplete() {
      if (!selectedProject?.id) return;

      if (!navigator.onLine) {
        void refreshOfflineApprovals(selectedProject.id);
        return;
      }

      void loadApprovals(selectedProject.id, showArchivedEntries);
      void refreshOfflineApprovals(selectedProject.id);
    }

    async function handleSendComplete() {
      if (!selectedProject?.id) return;

      setIsSendMode(false);
      setSendCloseSignal((k) => k + 1);
      setShowDeliveryHistory(true);

      if (!isBrowserOnline) return;

      await loadProofs(selectedProject.id, showArchivedEntries);
      await loadApprovals(selectedProject.id, showArchivedEntries);
      await refreshOfflineProofs(selectedProject.id);
      await refreshOfflineApprovals(selectedProject.id);
    }

    window.addEventListener("buildproof-data-changed", handleBuildProofDataChanged);
    window.addEventListener(
      "buildproof-offline-approval-sync-complete",
      handleOfflineApprovalSyncComplete as EventListener
    );
    window.addEventListener("buildproof-send-complete", handleSendComplete);

    return () => {
      window.removeEventListener("buildproof-data-changed", handleBuildProofDataChanged);
      window.removeEventListener(
        "buildproof-offline-approval-sync-complete",
        handleOfflineApprovalSyncComplete as EventListener
      );
      window.removeEventListener("buildproof-send-complete", handleSendComplete);
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
    if (!accountMenuOpen) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const el = accountMenuRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setAccountMenuOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!entryFilterMenuOpen) return;

    function onDown(e: MouseEvent | TouchEvent) {
      const el = entryFilterMenuRef.current;
      const target = e.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setEntryFilterMenuOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [entryFilterMenuOpen]);

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

  // Estimate tab's "Share Invoice" -- reuses the existing share-link
  // mechanism (project_shares + /share/[token]) rather than building a new
  // route. /api/share/create reuses an existing not-yet-sent share token for
  // the project if one exists, or mints a fresh one -- either way the
  // resulting /share/[token] page already renders the running total, line
  // items, and baseline badge added in this same pass, so no server-side
  // "invoice mode" flag is needed on the link itself.
  async function handleShareInvoice(projectId: string) {
    setShareInvoiceStatus("Getting link...");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/share/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.share?.token) {
        setShareInvoiceStatus(data?.error || "Failed to get share link.");
        return;
      }

      // ?invoice=1 switches the share page into its filtered invoice-only
      // render (line-item-bearing approvals, no timeline entries) -- see
      // app/share/[token]/page.tsx's isInvoiceMode.
      const fullUrl = `${window.location.origin}/share/${data.share.token}?invoice=1`;

      try {
        await navigator.clipboard.writeText(fullUrl);
        setShareInvoiceStatus(`Link copied: ${fullUrl}`);
      } catch {
        setShareInvoiceStatus(`Share link: ${fullUrl}`);
      }
    } catch (err: any) {
      setShareInvoiceStatus(err?.message || "Failed to get share link.");
    }
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
        (record) =>
          !serverContentSet.has((record.content || "").trim().toLowerCase())
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

      setOfflineApprovals(records);
    } catch (error) {
      console.error("Failed to load offline approvals", error);
      setOfflineApprovals([]);
    }
  }

  async function refreshOfflineProjects() {
    try {
      const records = await getAllOfflineProjects();
      setOfflineProjects(records);
    } catch (error) {
      console.error("Failed to load offline projects", error);
      setOfflineProjects([]);
    }
  }

  async function syncOfflineProjects() {
    if (!navigator.onLine || !userId) return;

    try {
      const records = await getAllOfflineProjects();
      const pendingProjects = records.filter((p) => p.status === "pending");
      const { claimOfflineProject } = await import("@/lib/offlineProjectOutbox");

      for (const record of pendingProjects) {
        const claimed = await claimOfflineProject(record.id);
        if (!claimed) continue;

        let data: any = null;
        let error: any = null;

        if (record.id.startsWith("offline-project-")) {
          const result = await supabase
            .from("projects")
            .insert({
              title: record.name,
              user_id: userId,
              client_name: record.clientName,
              client_email: record.clientEmail,
              client_phone: record.clientPhone,
              project_address: record.projectAddress,
              private_notes: record.privateNotes ?? null,
              organization_id: record.organizationId ?? null,
            })
            .select(
              "id,title,user_id,client_name,client_email,client_phone,project_address,private_notes,archived_at,created_at"
            )
            .single();

          data = result.data;
          error = result.error;

          if (error || !data?.id) {
            console.error("Offline project sync failed", error);

            await updateOfflineProject(record.id, {
              status: "pending",
              lastError: error?.message || "Sync failed",
              lastSyncAttemptAt: new Date().toISOString(),
              syncAttemptCount: (record.syncAttemptCount || 0) + 1,
            });

            continue;
          }

          await remapOfflineProofProjectId(record.id, data.id);
          await remapOfflineAttachmentProjectId(record.id, data.id);
          await remapOfflineApprovalProjectId(record.id, data.id);

          const { remapOfflineSendProjectId } = await import(
            "@/lib/offlineSendOutbox"
          );

          await remapOfflineSendProjectId(record.id, data.id);

          const { remapOfflineApprovalSendProjectId } = await import(
            "@/lib/offlineApprovalSendOutbox"
          );

          await remapOfflineApprovalSendProjectId(record.id, data.id);

        } else {
          const result = await supabase
            .from("projects")
            .update({
              client_name: record.clientName,
              client_email: record.clientEmail,
              client_phone: record.clientPhone,
              project_address: record.projectAddress,
              private_notes: record.privateNotes ?? null,
            })
            .eq("id", record.id)
            .select(
              "id,title,user_id,client_name,client_email,client_phone,project_address,private_notes,archived_at,created_at"
            )
            .single();

          data = result.data;
          error = result.error;

          if (error || !data?.id) {
            console.error("Offline project update sync failed", error);

            await updateOfflineProject(record.id, {
              status: "pending",
              lastError: error?.message || "Sync failed",
              lastSyncAttemptAt: new Date().toISOString(),
              syncAttemptCount: (record.syncAttemptCount || 0) + 1,
            });

            continue;
          }
        }

        const syncedProject = data as Project;

        saveRecentProject({
          id: syncedProject.id,
          title: syncedProject.title,
          client_name: syncedProject.client_name ?? null,
          client_email: syncedProject.client_email ?? null,
          client_phone: syncedProject.client_phone ?? null,
          project_address: syncedProject.project_address ?? null,
        });

        setProjects((current) => {
          const withoutOffline = current.filter((p) => p.id !== record.id);
          const withoutSyncedDuplicate = withoutOffline.filter(
            (p) => p.id !== syncedProject.id
          );
          return [syncedProject, ...withoutSyncedDuplicate];
        });

        if (selectedProject?.id === record.id) {
          const remappedProofs = proofs
            .filter((p) => p.project_id === record.id)
            .map((p) => ({
              ...p,
              project_id: syncedProject.id,
            }));

          const remappedApprovals = approvals
            .filter((a) => a.project_id === record.id)
            .map((a) => ({
              ...a,
              project_id: syncedProject.id,
            }));

          setSelectedProjectWithTrace(
            syncedProject,
            "offline project sync remap"
          );
          saveLastOpenProjectId(syncedProject.id);

          cacheProjectSnapshot({
            project: syncedProject,
            proofs: remappedProofs,
            approvals: remappedApprovals,
          });
        }

        await removeOfflineProject(record.id);
      }

      await refreshOfflineProjects();
      await loadActiveProjects(userId);

      if (selectedProject?.id && !selectedProject.id.startsWith("offline-project-")) {
        await loadProofs(selectedProject.id, showArchivedEntries);
        await loadApprovals(selectedProject.id, showArchivedEntries);
      }
    } catch (error) {
      console.error("Failed to sync offline projects", error);
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
              created_at: p.createdAt,
              created_timezone_id: p.createdTimezoneId,
              created_timezone_offset_minutes:
                p.createdTimezoneOffsetMinutes,
            })
            .select(
              "id, created_at, created_timezone_id, created_timezone_offset_minutes"
            )
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
      .select("id,title,user_id,client_name,client_email,client_phone,project_address,private_notes,archived_at,created_at")
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      const message = String(error.message || "").toLowerCase();

      const looksOffline =
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("fetch");

      if (looksOffline) {
        const recent = getRecentProjects();

        if (recent.length > 0) {
          setProjects(recent as any);
        }

        return;
      }

      setStatus(`Load projects failed: ${error.message}`);
      return;
    }

    const nextProjects = (data ?? []) as Project[];
    setProjects(nextProjects);
    setStatus("");
  }

  async function preloadProofAttachments(proofsToCache: Proof[]) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    try {
      for (const proof of proofsToCache) {
        if (!proof?.id) continue;

        const { data, error } = await supabase
          .from("attachments")
          .select("id, proof_id, filename, mime_type, size_bytes, created_at, path")
          .eq("proof_id", proof.id)
          .order("created_at", { ascending: false });

        if (error) {
          const message = String(error.message || "").toLowerCase();

          const looksOffline =
            message.includes("failed to fetch") ||
            message.includes("network") ||
            message.includes("fetch");

          if (looksOffline) {
            continue;
          }

          console.error("Failed to preload proof attachments", proof.id, error);
          continue;
        }

        saveCachedAttachments(proof.id, (data ?? []) as any[]);
      }
    } catch (error) {
      console.error("Failed to preload proof attachments", error);
    }
  }

  async function loadProofs(
    projectId: string,
    includeArchived = showArchivedEntries,
    projectOverride?: Project
  ) {
    if (projectId.startsWith("offline-project-")) {
      return;
    }

    const source = includeArchived ? "proofs" : "proofs_active";

    // 🔒 Prevent fetch while offline
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const { data, error } = await supabase
      .from(source)
      .select("id,content,created_at,project_id,locked_at,deleted_at,deleted_by,updated_at,created_timezone_id,created_timezone_offset_minutes")
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
    if (nextProofs.length > 0) {
      cacheProjectSnapshot({
        project: projectOverride ?? selectedProject,
        proofs: nextProofs,
      });
    }
    await preloadProofAttachments(nextProofs);
    await refreshOfflineProofs(projectId);
    setProofStatus("");
  }

  async function loadApprovals(
    projectId: string,
    includeArchived = showArchivedEntries,
    projectOverride?: Project
  ) {
    try {
      if (projectId.startsWith("offline-project-")) {
        return;
      }

      // 🔒 Prevent fetch while offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }

      const token = await getAccessToken();

      console.log("🧱 LOAD APPROVALS REQUEST", { projectId, includeArchived });

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
      if (nextApprovals.length > 0) {
        cacheProjectSnapshot({
          project: projectOverride ?? selectedProject,
          approvals: nextApprovals,
        });
      }
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
  async function addProject(fields?: {
    title?: string;
    address?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
  }) {
    const title = (fields?.title ?? newProjectTitle).trim();
    if (!title) return;

    const address = fields?.address?.trim() || null;
    const clientName = fields?.clientName?.trim() || null;
    const clientEmail = fields?.clientEmail?.trim() || null;
    const clientPhone = fields?.clientPhone?.trim() || null;

    if (!navigator.onLine) {
      try {
        const offlineProjectId = createOfflineProjectId();
        const now = new Date().toISOString();

        await putOfflineProject({
          id: offlineProjectId,
          name: title,
          clientName,
          clientEmail,
          clientPhone,
          projectAddress: address,
          privateNotes: null,
          organizationId: orgContext?.organizationId ?? null,
          creatingUserId: userId ?? undefined,
          createdAt: now,
          updatedAt: now,
          status: "pending",
          syncAttemptCount: 0,
          lastSyncAttemptAt: null,
          lastError: null,
        });

        await refreshOfflineProjects();

        const offlineProject: Project = {
          id: offlineProjectId,
          title,
          user_id: userId || "offline-user",
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          project_address: address,
          private_notes: null,
          archived_at: null,
          created_at: now,
        };

        saveRecentProject({
          id: offlineProject.id,
          title: offlineProject.title,
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          project_address: address,
        });

        setSelectedProjectWithTrace(offlineProject, "offline project create");
        saveLastOpenProjectId(offlineProject.id);
        cacheProjectSnapshot({
          project: offlineProject,
          proofs: [],
          approvals: [],
        });

        setProjects((current) => {
          if (current.some((p) => p.id === offlineProject.id)) return current;
          return [offlineProject, ...current];
        });

        setProofs([]);
        setApprovals([]);
        setOfflineProofs([]);
        setOfflineApprovals([]);
        setNewProjectTitle("");
        setStatus("Project saved offline ✅ — will sync when connected.");
        scrollBackToOnboarding(500);
        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));
        return;
      } catch (e: any) {
        setStatus(e?.message || "Offline project save failed");
        return;
      }
    }

    if (!userId) return;

    setStatus("Saving project...");

    const { error } = await supabase.from("projects").insert({
      title,
      user_id: userId,
      organization_id: orgContext?.organizationId ?? null,
      project_address: address,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
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

      // 🟢 OFFLINE PATH
      if (!navigator.onLine) {
        await putOfflineProject({
          id: selectedProject.id,
          name: next,
          clientName: selectedProject.client_name ?? null,
          clientEmail: selectedProject.client_email ?? null,
          clientPhone: selectedProject.client_phone ?? null,
          projectAddress: selectedProject.project_address ?? null,
          privateNotes:
            selectedProject.private_notes ??
            projectNotesDraft ??
            null,
          createdAt:
            selectedProject.created_at ||
            new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "pending",
          syncAttemptCount: 0,
          lastSyncAttemptAt: null,
          lastError: null,
        });

        const updatedProject = {
          ...selectedProject,
          title: next,
        };

        setSelectedProjectWithTrace(
          updatedProject,
          "offline project rename"
        );

        setProjects((list) =>
          list.map((p) =>
            p.id === selectedProject.id
              ? { ...p, title: next }
              : p
          )
        );

        saveRecentProject({
          id: updatedProject.id,
          title: updatedProject.title,
          client_name: updatedProject.client_name ?? null,
          client_email: updatedProject.client_email ?? null,
          client_phone: updatedProject.client_phone ?? null,
          project_address:
            updatedProject.project_address ?? null,
        });

        cacheProjectSnapshot({
          project: updatedProject,
        });

        setStatus(
          "Project renamed offline ✅ — will sync when connected."
        );

        renameInputRef.current?.blur();
        setRenaming(false);
        setProjectMenuOpen(false);

        return;
      }

      // 🔵 ONLINE PATH
      const { error } = await supabase
        .from("projects")
        .update({ title: next })
        .eq("id", selectedProject.id);

      if (error) throw error;

      const updatedProject = {
        ...selectedProject,
        title: next,
      };

      setSelectedProjectWithTrace(
        updatedProject,
        "project rename"
      );

      setProjects((list) =>
        list.map((p) =>
          p.id === selectedProject.id
            ? { ...p, title: next }
            : p
        )
      );

      saveRecentProject({
        id: updatedProject.id,
        title: updatedProject.title,
        client_name: updatedProject.client_name ?? null,
        client_email: updatedProject.client_email ?? null,
        client_phone: updatedProject.client_phone ?? null,
        project_address:
          updatedProject.project_address ?? null,
      });

      cacheProjectSnapshot({
        project: updatedProject,
      });

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
      setSelectedProjectWithTrace(null, "archiveProject");
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
    setSelectedProjectWithTrace(null, "closeProjectView");
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

      const safeTitle = (selectedProject.title || "Leeward_Project").replace(/[^\w\-]+/g, "_");

      const a = document.createElement("a");
      a.href = url;
      a.download = `Leeward_${safeTitle}.pdf`;
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

      const safeTitle = (selectedProject.title || "Leeward_Project").replace(
        /[^\w\-]+/g,
        "_"
      );

      const useNativePdfSaver =
        Capacitor.isNativePlatform() &&
        Capacitor.getPlatform() === "android" &&
        Capacitor.isPluginAvailable("PdfSaver");

      if (useNativePdfSaver) {
        await PdfSaver.savePdf({
          fileName: `Leeward_Dispute_Package_${safeTitle}.pdf`,
          exportUrl: `${window.location.origin}/api/export/pdf`,
          accessToken: token,
          projectId: selectedProject.id,
          reportMode: "dispute",
        });

        setStatus("Dispute package saved.");
        return;
      }

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

      const a = document.createElement("a");
      a.href = url;
      a.download = `Leeward_Dispute_Package_${safeTitle}.pdf`;
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
        creatingUserId: userId ?? undefined,
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
        const timezoneSnapshot = getCurrentTimezoneSnapshot();

        const response = await supabase
          .from("proofs")
          .insert({
            content: text,
            project_id: projectId,
            created_timezone_id: timezoneSnapshot.created_timezone_id,
            created_timezone_offset_minutes:
              timezoneSnapshot.created_timezone_offset_minutes,
          })
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

  async function deleteEntry(proofId: number | string) {
    if (!selectedProject) return;

    const ok = window.confirm("Delete this entry permanently?");
    if (!ok) return;

    const isOffline =
      typeof navigator !== "undefined" && !navigator.onLine;

    try {
      setWorkingProofId(proofId);
      setProofStatus("Deleting...");

      // 🟢 OFFLINE DELETE
      if (isOffline) {
        if (typeof proofId !== "string") {
          throw new Error("Offline delete requires local draft id.");
        }

        const { deleteOfflineProof } = await import(
          "@/lib/offlineProofOutbox"
        );

        await deleteOfflineProof(proofId);

        await refreshOfflineProofs(selectedProject.id);

        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));

        setProofStatus("Deleted ✅");
        return;
      }

      // 🔵 ONLINE DELETE
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

  async function saveEditEntry(proofId: number | string) {
    if (!selectedProject) return;

    const next = editDraftContent.trim();
    if (!next) {
      alert("Entry text can’t be empty. (Delete it instead.)");
      return;
    }

    const isOffline =
      typeof navigator !== "undefined" && !navigator.onLine;

    try {
      setWorkingProofId(proofId);
      setProofStatus("Saving...");

      if (isOffline) {
        if (typeof proofId !== "string") {
          throw new Error("Offline edit requires local draft id.");
        }

        const { updateOfflineProof } = await import(
          "@/lib/offlineProofOutbox"
        );

        await updateOfflineProof(proofId, {
          content: next,
        });

        await refreshOfflineProofs(selectedProject.id);

        window.dispatchEvent(new CustomEvent("buildproof-data-changed"));

        setProofStatus("Updated ✅");
        setEditingProofId(null);
        setEditDraftContent("");
        return;
      }

      const { error } = await supabase
        .from("proofs")
        .update({ content: next })
        .eq("id", proofId);

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

      if (!navigator.onLine) {
        await putOfflineProject({
          id: selectedProject.id,
          name: selectedProject.title,
          clientName: payload.client_name,
          clientEmail: payload.client_email,
          clientPhone: payload.client_phone,
          projectAddress: payload.project_address,
          privateNotes: selectedProject.private_notes ?? projectNotesDraft ?? null,
          createdAt: selectedProject.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "pending",
          syncAttemptCount: 0,
          lastSyncAttemptAt: null,
          lastError: null,
        });

        const updatedProject = { ...selectedProject, ...payload };

        setSelectedProjectWithTrace(updatedProject, "offline client save");
        setProjects((list) =>
          list.map((p) => (p.id === selectedProject.id ? { ...p, ...payload } : p))
        );
        cacheProjectSnapshot({ project: updatedProject });

        saveRecentProject({
          id: updatedProject.id,
          title: updatedProject.title,
          client_name: updatedProject.client_name ?? null,
          client_email: updatedProject.client_email ?? null,
          client_phone: updatedProject.client_phone ?? null,
          project_address: updatedProject.project_address ?? null,
        });

        setStatus("Client saved offline ✅ — will sync when connected.");
        setClientEditing(false);
        return;
      }

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

      setSelectedProjectWithTrace(updatedProject, "client save");
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

  async function saveProjectNotes(nextNotes: string) {
    if (!selectedProject || !userId) return;

    const payload = {
      private_notes: nextNotes,
    };

    try {
      if (!navigator.onLine) {
        await putOfflineProject({
          id: selectedProject.id,
          name: selectedProject.title,
          clientName: selectedProject.client_name ?? null,
          clientEmail: selectedProject.client_email ?? null,
          clientPhone: selectedProject.client_phone ?? null,
          projectAddress: selectedProject.project_address ?? null,
          privateNotes: nextNotes,
          createdAt: selectedProject.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "pending",
          syncAttemptCount: 0,
          lastSyncAttemptAt: null,
          lastError: null,
        });

        const updatedProject = {
          ...selectedProject,
          private_notes: nextNotes,
        };

        setSelectedProjectWithTrace(updatedProject, "offline project notes save");
        setProjects((list) =>
          list.map((p) =>
            p.id === selectedProject.id ? updatedProject : p
          )
        );
        cacheProjectSnapshot({ project: updatedProject });

        return;
      }

      const { error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", selectedProject.id);

      if (error) throw error;

      const updatedProject = {
        ...selectedProject,
        private_notes: nextNotes,
      };

      setSelectedProjectWithTrace(updatedProject, "project notes save");
      setProjects((list) =>
        list.map((p) =>
          p.id === selectedProject.id ? updatedProject : p
        )
      );
      cacheProjectSnapshot({ project: updatedProject });
    } catch (e) {
      console.error("Project notes save failed", e);
    }
  }

  function scheduleProjectNotesSave(nextNotes: string) {
    setProjectNotesDraft(nextNotes);

    if (projectNotesSaveTimerRef.current) {
      window.clearTimeout(projectNotesSaveTimerRef.current);
    }

    projectNotesSaveTimerRef.current = window.setTimeout(() => {
      void saveProjectNotes(nextNotes);
    }, 900);
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
      name: "Inspection Failed",
      text: "Inspection Failed\n\nInspector:\nArea inspected:\nReason:\nAction required:\nFollow-up date:\nNotes:",
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
    setIsNewProjectModalOpen(true);
  }

  function handleOpenFirstProject() {
    pulseHighlight("onboarding-project-list");
  }

  function handleAddFirstEntryClick() {
    setIsAddEntryMode(true);
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
    pulseHighlight("onboarding-send-trigger");
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

    window.localStorage.setItem("Leeward_onboarding_complete", "true");

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

    const normalizedOfflineProjects: Project[] = offlineProjects.map((p) => ({
      id: p.id,
      title: p.name,
      user_id: userId || "offline-user",
      client_name: p.clientName,
      client_email: p.clientEmail,
      client_phone: p.clientPhone,
      project_address: p.projectAddress,
      archived_at: null,
      created_at: p.createdAt,
    }));

    const serverIdSet = new Set(projects.map((p) => p.id));

    let list: Project[] = [
      ...projects,
      ...normalizedOfflineProjects.filter((p) => !serverIdSet.has(p.id)),
    ];

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
  }, [projects, offlineProjects, projectSearch, projectSortMode, userId]);

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
    if (q) {
      list = list.filter((p) =>
        cleanText(
          `${p.content} ${"isOffline" in p ? p.createdAt : p.created_at} ${p.id}`
        ).includes(q)
      );
    }

    if (entryContentFilter !== "all") {
      list = list.filter((p) => getProofContentKind(p) === entryContentFilter);
    }

    if (entryStatusFilter !== "all") {
      list = list.filter((p) => getProofStatusKind(p) === entryStatusFilter);
    }

    return list;
  }, [
    proofs,
    offlineProofs,
    entrySearch,
    entrySortMode,
    entryContentFilter,
    entryStatusFilter,
    attachmentsRefreshKey,
  ]);

  const [visibleApprovals, setVisibleApprovals] = useState<Approval[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function buildVisibleApprovals() {
      const normalizedOfflineApprovals = await Promise.all(
        offlineApprovals.map(async (a) => {
          const queuedAttachments = await getOfflineApprovalAttachmentsForApproval({
            approvalId: a.id.startsWith("offline-") ? null : a.id,
            offlineApprovalId: a.id.startsWith("offline-") ? a.id : null,
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
            created_timezone_id: a.createdTimezoneId ?? null,
            created_timezone_offset_minutes:
              a.createdTimezoneOffsetMinutes ?? null,
            attachments: queuedAttachments.map((item) => ({
              id: item.id,
              filename: item.fileName ?? null,
              mime_type: item.mimeType ?? null,
              path: "",
              isOffline: true, // 🔥 ADD THIS
            }))
          };
        })
      );

      const approvalMap = new Map<string, Approval>();

      for (const approval of approvals) {
        approvalMap.set(approval.id, approval);
      }

      for (const offlineApproval of normalizedOfflineApprovals) {
        const existingApproval = approvalMap.get(offlineApproval.id) as any;

        if (existingApproval) {
          approvalMap.set(offlineApproval.id, {
            ...existingApproval,
            ...offlineApproval,
            attachments: [
              ...(existingApproval.attachments || []),
              ...(offlineApproval.attachments || []),
            ],
          } as Approval);
        } else {
          approvalMap.set(offlineApproval.id, offlineApproval as Approval);
        }
      }

      const nextVisibleApprovals = Array.from(approvalMap.values()).sort((a, b) =>
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

  // Estimate tab running-total snapshot: baseline (once approved) plus every
  // approved change order. Pending/draft items are deliberately excluded from
  // the total until approved, per the design doc's snapshot-model decision --
  // a pending change order is visible in the feed but shouldn't move the
  // number a client might be looking at.
  function approvalValue(a: Approval): number {
    if (Array.isArray(a.line_items) && a.line_items.length > 0) {
      return a.line_items.reduce(
        (sum, li) => sum + (Number(li.line_total) || 0),
        0
      );
    }
    return Number(a.cost_delta) || 0;
  }

  const estimateSummary = useMemo(() => {
    const baseline = visibleApprovals.find((a) => a.is_baseline);

    const approvedTotal = visibleApprovals.reduce((sum, a) => {
      if (a.status !== "approved") return sum;
      return sum + approvalValue(a);
    }, 0);

    const approvedCount = visibleApprovals.filter(
      (a) => a.status === "approved"
    ).length;

    const pendingCount = visibleApprovals.filter(
      (a) => a.status === "draft" || a.status === "pending"
    ).length;

    return { baseline, approvedTotal, approvedCount, pendingCount };
  }, [visibleApprovals]);

  // Estimate tab: the baseline is pinned in its own section above everything
  // else (mirrors the client-facing invoice page's "Original Estimate" /
  // "Change Orders" split), so these two lists explicitly exclude whichever
  // approval is_baseline so it isn't rendered twice.
  const otherDraftApprovals = useMemo(() => {
    const baselineId = estimateSummary.baseline?.id;
    return draftApprovals.filter((a) => a.id !== baselineId);
  }, [draftApprovals, estimateSummary.baseline]);

  const otherFinalizedApprovals = useMemo(() => {
    const baselineId = estimateSummary.baseline?.id;
    return approvals.filter(
      (a) => a.status !== "draft" && a.status !== "pending" && a.id !== baselineId
    );
  }, [approvals, estimateSummary.baseline]);

  if (!hasMounted) return null;

  return (
    <>
      <OfflineAttachmentBootstrap />

      <div className="container">
        <div className="shell">
          <div className="card">
            <div className="row" style={{ flexWrap: "wrap", rowGap: 10 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {/* The logo PNG has a baked-in white background (not
                    transparent), so on a dark theme it reads as a stray
                    white rectangle unless it's deliberately framed as a
                    white "chip" -- a real transparent/dark-mode logo asset
                    would be the better long-term fix. */}
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 12,
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    lineHeight: 0,
                  }}
                >
                  <img
                    src="/Leeward-Logo-Approved-Concept.png"
                    alt="Leeward"
                    style={{
                      height: 84,
                      width: "auto",
                      display: "block",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "stretch",
                  flexShrink: 0,
                }}
              >
                {billingSource === "organization" ? (
                  <button className="btn" onClick={openMembersPanel}>
                    {orgContext?.role === "owner" ? "Invite Team" : "Team"}
                  </button>
                ) : (
                  <button className="btn" onClick={openUpgradePanel}>
                    Upgrade
                  </button>
                )}

                <div style={{ position: "relative" }} ref={accountMenuRef}>
                  <button
                    className="btn"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    title="Account"
                    style={{ width: "100%" }}
                  >
                    Account
                  </button>

                  {accountMenuOpen ? (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 44,
                        zIndex: 20,
                        width: 240,
                        maxWidth: "min(280px, calc(100vw - 24px))",
                        border: "1px solid var(--borderStrong)",
                        borderRadius: 14,
                        background: "var(--card)",
                        padding: 10,
                        boxShadow: "var(--shadowSoft)",
                        display: "grid",
                        gap: 8,
                        boxSizing: "border-box",
                      }}
                    >
                      <ThemeToggle />

                      <button
                        className="btn"
                        style={{ width: "100%" }}
                        onClick={() => router.push("/help")}
                      >
                        Help
                      </button>

                      <button
                        className="btn"
                        style={{ width: "100%" }}
                        onClick={async () => {
                          try {
                            const token = await getAccessToken();

                            const res = await fetch("/api/billing/portal", {
                              method: "POST",
                              headers: {
                                Authorization: `Bearer ${token}`,
                              },
                            });

                            const data = await res.json();

                            if (!res.ok || !data?.url) {
                              throw new Error(data?.error || "Unable to open billing portal.");
                            }

                            window.location.href = data.url;
                          } catch (e: any) {
                            setStatus(e?.message || "Unable to open billing portal.");
                          }
                        }}
                      >
                        Manage Billing
                      </button>

                      <button className="btn btnDanger" style={{ width: "100%" }} onClick={logout}>
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
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
                  border: "1px solid rgba(var(--success-rgb),0.22)",
                  background: "rgba(var(--success-rgb),0.08)",
                  boxShadow: "0 12px 30px rgba(var(--success-rgb),0.10)",
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

          {dashboardReady && activeGlobalTab === "projects" ? (
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
                border: "1px solid rgba(var(--success-rgb),0.22)",
                background: "rgba(var(--success-rgb),0.08)",
                boxShadow: "0 12px 30px rgba(var(--success-rgb),0.10)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>You’re ready to go</div>
              <div className="sub" style={{ opacity: 0.9 }}>
                {onboardingCongrats}
              </div>
            </div>
          ) : null}

          <NewProjectModal
            open={isNewProjectModalOpen}
            onClose={() => setIsNewProjectModalOpen(false)}
            onCreate={async (fields) => {
              await addProject(fields);
              setIsNewProjectModalOpen(false);
            }}
          />

          {selectedProject ? (
            <SendUpdateModal
              open={isSendMode}
              onClose={() => {
                setIsSendMode(false);
                setSendCloseSignal((k) => k + 1);
              }}
              projectId={selectedProject.id}
              projectTitle={selectedProject.title}
              clientName={selectedProject.client_name ?? undefined}
              clientEmail={selectedProject.client_email ?? undefined}
              clientPhone={selectedProject.client_phone ?? undefined}
              entryCount={
                filteredProofs.filter((proof) => {
                  if ("isOffline" in proof) return true;
                  return !proof.locked_at && !proof.deleted_at;
                }).length
              }
              archivedEntryCount={proofs.filter((p) => !!p.deleted_at).length}
              showDeliveryHistory={showDeliveryHistory}
              onToggleDeliveryHistory={() => setShowDeliveryHistory((v) => !v)}
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
          ) : null}

          {!isSendMode && !selectedProject && activeGlobalTab === "projects" ? (
            <div
              id="onboarding-project-area"
              className="card"
              style={{
                border:
                  highlightTarget === "onboarding-project-area"
                    ? "2px solid rgba(var(--accent-rgb),0.55)"
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
                <button
                  id="new-project-trigger"
                  className="btn btnPrimary"
                  style={{ width: "100%", fontWeight: 700 }}
                  onClick={() => setIsNewProjectModalOpen(true)}
                >
                  + New Project
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
                          setSelectedProjectWithTrace(cached.project, "offline null guard restore");
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

                        setSelectedProjectWithTrace(p, "project list click online");
                        saveLastOpenProjectId(p.id);


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
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 19,
                            fontWeight: 900,
                            color: "var(--text)",
                            lineHeight: 1.15,
                          }}
                        >
                          {p.title}
                        </div>

                        {p.client_name || p.client_email || p.client_phone || p.project_address ? (
                          <div className="sub" style={{ opacity: 0.7, fontSize: 12 }}>
                            {[p.client_name, p.client_email, p.client_phone, p.project_address]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          opacity: 0.55,
                          whiteSpace: "nowrap",
                          paddingTop: 4,
                        }}
                      >
                        {p.created_at
                          ? new Date(p.created_at).toLocaleDateString("en-US", {
                            month: "numeric",
                            day: "numeric",
                            year: "2-digit",
                          })
                          : ""}
                      </div>
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

          {selectedProject && activeGlobalTab === "projects" && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "var(--accentText)",
                      marginBottom: 4,
                    }}
                  >
                    Project
                  </div>

                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 30,
                      letterSpacing: -0.4,
                      lineHeight: 1.1,
                      color: "var(--text)",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedProject.title || "Project"}
                  </div>
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
                      } else if (isAddEntryMode) {
                        setIsAddEntryMode(false);
                      } else {
                        closeProjectView();
                      }
                    }}
                    title={
                      isSendMode
                        ? "Exit send mode"
                        : isApprovalMode
                          ? "Exit approval mode"
                          : isAddEntryMode
                            ? "Exit add entry mode"
                            : "Close project view"
                    }
                  >
                    {isSendMode
                      ? "Exit Send"
                      : isApprovalMode
                        ? "Exit Approval"
                        : isAddEntryMode
                          ? "Exit Add Entry"
                          : "Close"}
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
                            border: "1px solid var(--borderStrong)",
                            borderRadius: 14,
                            background: "var(--card)",
                            padding: 10,
                            boxShadow: "var(--shadowSoft)",
                            display: "grid",
                            gap: 8,
                            boxSizing: "border-box",
                            overflow: "visible",
                          }}
                        >
                          {!renaming ? (
                            <>
                              <button
                                className="btn"
                                style={{ width: "100%" }}
                                onClick={() => {
                                  setProjectMenuOpen(false);
                                  setProjectNotesOpen(true);
                                }}
                              >
                                Project Notes
                              </button>

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
                                  border: "1px solid var(--borderStrong)",
                                  background: "var(--card)",
                                  color: "var(--text)",
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

              <div
                style={{
                  height: 1,
                  background: "var(--borderSoft)",
                  margin: "14px 0",
                }}
              />

              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: 4,
                  borderRadius: 12,
                  background: "var(--surfaceSoft)",
                }}
              >
                <button
                  className="btn"
                  onClick={() => setActiveProjectTab("timeline")}
                  style={{
                    flex: 1,
                    background: activeProjectTab === "timeline" ? "var(--card)" : "transparent",
                    color: activeProjectTab === "timeline" ? "var(--text)" : "var(--muted)",
                    fontWeight: activeProjectTab === "timeline" ? 700 : 500,
                    border: "none",
                    boxShadow: activeProjectTab === "timeline" ? "var(--shadow)" : "none",
                  }}
                >
                  Timeline
                </button>
                <button
                  className="btn"
                  onClick={() => setActiveProjectTab("estimate")}
                  style={{
                    flex: 1,
                    background: activeProjectTab === "estimate" ? "var(--card)" : "transparent",
                    color: activeProjectTab === "estimate" ? "var(--text)" : "var(--muted)",
                    fontWeight: activeProjectTab === "estimate" ? 700 : 500,
                    border: "none",
                    boxShadow: activeProjectTab === "estimate" ? "var(--shadow)" : "none",
                  }}
                >
                  Estimate
                </button>
              </div>

              {activeProjectTab === "timeline" && !isSendMode ? (
                <button
                  id="onboarding-send-trigger"
                  className="btn btnPrimary"
                  onClick={() => {
                    setIsApprovalMode(false);
                    setIsSendMode(true);
                  }}
                  style={{
                    width: "100%",
                    marginTop: 14,
                    fontWeight: 700,
                    boxShadow:
                      highlightTarget === "onboarding-send-trigger"
                        ? "0 0 0 6px rgba(59,130,246,0.35)"
                        : undefined,
                    transition: "all 0.25s ease",
                  }}
                >
                  Send Update
                </button>
              ) : null}
            </div>
          )}

          {selectedProject && activeGlobalTab === "projects" && !isSendMode && (
            <div
              id="client-info-section"
              className="card"
              style={{
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
                      color: "var(--accentText)",
                      paddingBottom: 6,
                      borderBottom: "1px solid rgba(var(--accent-rgb),0.35)",
                      marginBottom: 8,
                    }}
                  >
                    Client
                  </div>

                  <div
                    style={{
                      fontSize: 16,
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
                <div style={{ display: "grid", gap: 8, minWidth: 0, marginTop: 10 }}>
                  <input
                    className="input"
                    placeholder="Client name..."
                    value={clientNameDraft}
                    onChange={(e) => setClientNameDraft(e.target.value)}
                  />

                  <input
                    id="client-email-input"
                    className="input"
                    placeholder="Client email..."
                    value={clientEmailDraft}
                    onChange={(e) => setClientEmailDraft(e.target.value)}
                  />

                  <input
                    className="input"
                    type="tel"
                    placeholder="Client phone..."
                    value={clientPhoneDraft}
                    onChange={(e) => setClientPhoneDraft(e.target.value)}
                  />

                  <input
                    className="input"
                    placeholder="Project address..."
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
          )}

          {selectedProject && activeGlobalTab === "projects" && isApprovalMode && (
            <div ref={approvalComposerRef}>
              <ApprovalComposer
                projectId={selectedProject.id}
                projectClientEmail={selectedProject.client_email ?? null}
                initialApproval={editingApproval}
                defaultIsBaseline={approvalComposerDefaultBaseline}
                onComplete={async () => {
                  window.localStorage.removeItem(`approval-draft:${selectedProject.id}`);
                  setIsApprovalMode(false);
                  setEditingApproval(null);
                  setApprovalComposerDefaultBaseline(false);
                  await loadApprovals(selectedProject.id);
                }}
              />
            </div>
          )}

          {selectedProject && activeGlobalTab === "projects" && activeProjectTab === "estimate" && (
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Estimate</div>

              <div
                style={{
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 14,
                  background: "var(--surfaceSoft)",
                  border: "1px solid var(--borderSoft)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    opacity: 0.55,
                    marginBottom: 6,
                  }}
                >
                  Current Total
                </div>

                <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text)" }}>
                  {estimateSummary.approvedTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })}
                </div>

                <div className="sub" style={{ marginTop: 6, opacity: 0.75 }}>
                  {estimateSummary.approvedCount} approved
                  {estimateSummary.pendingCount > 0
                    ? ` · ${estimateSummary.pendingCount} pending (not yet included)`
                    : ""}
                  {!estimateSummary.baseline ? " · no baseline estimate yet" : ""}
                </div>

                {estimateSummary.baseline ? (
                  <button
                    className="btn"
                    style={{ marginTop: 10, width: "fit-content" }}
                    onClick={() => handleShareInvoice(selectedProject.id)}
                  >
                    Share Invoice
                  </button>
                ) : null}

                {shareInvoiceStatus ? (
                  <div className="sub" style={{ marginTop: 6, opacity: 0.75, wordBreak: "break-all" }}>
                    {shareInvoiceStatus}
                  </div>
                ) : null}
              </div>

              <p className="sub" style={{ opacity: 0.75, marginBottom: 14 }}>
                Baseline estimate and change orders for this project. The Share Invoice button above
                gives the client a live link showing the running total, itemized line items, and the
                same approval feed below.
              </p>

              {estimateSummary.baseline ? (
                <div style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      opacity: 0.6,
                      marginBottom: 8,
                    }}
                  >
                    Baseline Estimate
                  </div>

                  <ApprovalCard
                    key={estimateSummary.baseline.id}
                    approval={estimateSummary.baseline}
                    onUpdated={async () => {
                      await loadApprovals(selectedProject.id);
                    }}
                    onEdit={
                      estimateSummary.baseline.status === "draft" ||
                      estimateSummary.baseline.status === "pending"
                        ? (approval) => {
                          setEditingApproval(approval);
                          setIsApprovalMode(true);
                        }
                        : undefined
                    }
                  />
                </div>
              ) : null}

              {otherDraftApprovals.length > 0 || otherFinalizedApprovals.length > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    opacity: 0.6,
                    marginBottom: 8,
                  }}
                >
                  Change Orders
                </div>
              ) : null}

              {otherDraftApprovals.length > 0 ? (
                <div className="list" style={{ marginTop: 0, marginBottom: 14, display: "grid", gap: 14 }}>
                  {otherDraftApprovals.map((approval) => (
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

              {otherFinalizedApprovals.length > 0 ? (
                <div className="list" style={{ marginTop: 0, display: "grid", gap: 14 }}>
                  {otherFinalizedApprovals.map((approval) => (
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

              {!estimateSummary.baseline &&
              otherDraftApprovals.length === 0 &&
              otherFinalizedApprovals.length === 0 ? (
                <p className="sub" style={{ opacity: 0.6, marginTop: 4 }}>
                  No estimate or change orders yet. Tap the + button to create one.
                </p>
              ) : null}
            </div>
          )}

          {selectedProject &&
            activeGlobalTab === "projects" &&
            activeProjectTab === "estimate" &&
            !isApprovalMode && (
              <button
                className="btn btnPrimary"
                aria-label={estimateSummary.baseline ? "New Change Order" : "New Estimate"}
                title={estimateSummary.baseline ? "New Change Order" : "New Estimate"}
                style={{
                  position: "fixed",
                  right: 20,
                  bottom: 24,
                  zIndex: 40,
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  padding: 0,
                  boxShadow: "0 8px 24px rgba(var(--text-rgb),0.25)",
                  fontSize: 28,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => {
                  window.localStorage.removeItem(`approval-draft:${selectedProject.id}`);
                  setEditingApproval(null);
                  setApprovalComposerDefaultBaseline(!estimateSummary.baseline);
                  setIsApprovalMode(true);
                }}
              >
                +
              </button>
            )}

          {selectedProject &&
            activeGlobalTab === "projects" &&
            activeProjectTab === "timeline" &&
            !isSendMode &&
            !isAddEntryMode && (
              <button
                className="btn btnPrimary"
                aria-label="Add entry"
                title="Add entry"
                style={{
                  position: "fixed",
                  right: 20,
                  bottom: 24,
                  zIndex: 40,
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  padding: 0,
                  boxShadow: "0 8px 24px rgba(var(--text-rgb),0.25)",
                  fontSize: 28,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => setIsAddEntryMode(true)}
              >
                +
              </button>
            )}

          {selectedProject && activeGlobalTab === "projects" && activeProjectTab === "timeline" && (
            <div className="card">

              {/* Send Update now renders as SendUpdateModal (a real overlay), not inline here -- see the modal render near NewProjectModal above. */}

              {!isSendMode && !isApprovalMode ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "var(--accentText)",
                        paddingBottom: 6,
                        borderBottom: "1px solid rgba(var(--accent-rgb),0.35)",
                        display: "inline-block",
                      }}
                    >
                      Project Timeline
                    </div>

                    {isAddEntryMode ? (
                      <button
                        type="button"
                        className={`btn ${showTemplates ? "btnDanger" : ""}`}
                        onClick={() => setShowTemplates((v) => !v)}
                        style={{
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {showTemplates ? "Hide Templates" : "⚡ Templates"}
                      </button>
                    ) : null}
                  </div>

                  {isAddEntryMode ? (
                  <div
                    id="onboarding-entry-area"
                    ref={addEntryRef}
                    style={{
                      display: "grid",
                      gap: 8,
                      marginTop: 6,
                      marginBottom: 14,
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
                      placeholder="Add entry..."
                      value={newProofContent}
                      onChange={(e) => {
                        setNewProofContent(e.target.value);
                        setIsTemplateText(false);
                      }}
                    />

                    {showTemplates ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
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
                            style={{
                              width: "100%",
                              justifyContent: "center",
                              padding: "10px 6px",
                              fontSize: 13,
                              borderRadius: 10,
                            }}
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn"
                        onClick={() => setIsAddEntryMode(false)}
                        style={{ flexShrink: 0 }}
                      >
                        Cancel
                      </button>

                      <button
                        className="btn btnPrimary"
                        onClick={addProof}
                        disabled={addingProof}
                        style={{ flex: 1, fontWeight: 700 }}
                      >
                        {addingProof ? "Saving..." : "Add Entry"}
                      </button>
                    </div>
                  </div>
                  ) : null}

                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input
                        className="input"
                        placeholder="Search timeline..."
                        value={entrySearch}
                        onChange={(e) => setEntrySearch(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: 38,
                          fontSize: 14,
                        }}
                      />

                      <div style={{ position: "relative" }} ref={entryFilterMenuRef}>
                        {(() => {
                          const hasActiveFilters =
                            entryContentFilter !== "all" ||
                            entryStatusFilter !== "all" ||
                            showArchivedEntries;

                          return (
                            <button
                              className="btn"
                              onClick={() => setEntryFilterMenuOpen((v) => !v)}
                              title="Filter & sort entries"
                              aria-label="Filter & sort entries"
                              style={{
                                height: 38,
                                width: 38,
                                padding: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                position: "relative",
                                background: hasActiveFilters
                                  ? "rgba(var(--accent-rgb),0.10)"
                                  : undefined,
                                color: hasActiveFilters ? "var(--accentText)" : undefined,
                                border: hasActiveFilters
                                  ? "1px solid rgba(var(--accent-rgb),0.25)"
                                  : undefined,
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polygon points="3 4 21 4 14 12.5 14 19 10 21 10 12.5 3 4" />
                              </svg>

                              {hasActiveFilters ? (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: 3,
                                    right: 3,
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: "var(--accentText)",
                                  }}
                                />
                              ) : null}
                            </button>
                          );
                        })()}

                        {entryFilterMenuOpen ? (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 44,
                              zIndex: 20,
                              width: 230,
                              maxWidth: "min(260px, calc(100vw - 24px))",
                              border: "1px solid var(--borderStrong)",
                              borderRadius: 14,
                              background: "var(--card)",
                              padding: 12,
                              boxShadow: "var(--shadowSoft)",
                              display: "grid",
                              gap: 12,
                              boxSizing: "border-box",
                            }}
                          >
                            <div>
                              <div
                                className="sub"
                                style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
                              >
                                Content
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {(
                                  [
                                    { key: "all", label: "All" },
                                    { key: "notes", label: "Notes" },
                                    { key: "photos", label: "Photos" },
                                    { key: "files", label: "Files" },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.key}
                                    className="btn"
                                    onClick={() => setEntryContentFilter(opt.key)}
                                    style={{
                                      height: 30,
                                      fontSize: 12,
                                      padding: "2px 10px",
                                      borderRadius: 999,
                                      whiteSpace: "nowrap",
                                      background:
                                        entryContentFilter === opt.key
                                          ? "rgba(var(--accent-rgb),0.10)"
                                          : undefined,
                                      color:
                                        entryContentFilter === opt.key
                                          ? "var(--accentText)"
                                          : undefined,
                                      fontWeight: entryContentFilter === opt.key ? 700 : undefined,
                                      border:
                                        entryContentFilter === opt.key
                                          ? "1px solid rgba(var(--accent-rgb),0.25)"
                                          : undefined,
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div
                                className="sub"
                                style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
                              >
                                Status
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {(
                                  [
                                    { key: "all", label: "All" },
                                    { key: "draft", label: "Draft" },
                                    { key: "finalized", label: "Finalized" },
                                    { key: "archived", label: "Archived" },
                                  ] as const
                                ).map((opt) => (
                                  <button
                                    key={opt.key}
                                    className="btn"
                                    style={{
                                      height: 30,
                                      fontSize: 12,
                                      padding: "2px 10px",
                                      borderRadius: 999,
                                      whiteSpace: "nowrap",
                                      background:
                                        entryStatusFilter === opt.key
                                          ? "rgba(var(--accent-rgb),0.10)"
                                          : undefined,
                                      color:
                                        entryStatusFilter === opt.key
                                          ? "var(--accentText)"
                                          : undefined,
                                      fontWeight: entryStatusFilter === opt.key ? 700 : undefined,
                                      border:
                                        entryStatusFilter === opt.key
                                          ? "1px solid rgba(var(--accent-rgb),0.25)"
                                          : undefined,
                                    }}
                                    onClick={() => {
                                      setEntryStatusFilter(opt.key);

                                      if (opt.key === "archived" && !showArchivedEntries) {
                                        setShowArchivedEntries(true);
                                        loadProofs(selectedProject.id, true);
                                        loadApprovals(selectedProject.id, true);
                                      }
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div
                                className="sub"
                                style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
                              >
                                Sort
                              </div>
                              <button
                                className="btn"
                                onClick={() =>
                                  setEntrySortMode((current) =>
                                    current === "newest" ? "oldest" : "newest"
                                  )
                                }
                                style={{ width: "100%" }}
                              >
                                {entrySortMode === "newest" ? "Newest first" : "Oldest first"}
                              </button>
                            </div>

                            <button
                              className="btn"
                              onClick={() => {
                                const next = !showArchivedEntries;
                                setShowArchivedEntries(next);
                                loadProofs(selectedProject.id, next);
                                loadApprovals(selectedProject.id, next);
                              }}
                              style={{ width: "100%" }}
                            >
                              {showArchivedEntries ? "Hide Archived" : "Show Archived"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {proofStatus ? (
                      <div className="sub" style={{ opacity: 0.85 }}>
                        {proofStatus}
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
                      const isEditing = editingProofId === proof.id;

                      return (
                        <div
                          key={offline ? proof.id : proof.id}
                          className="proofItem"
                          style={{
                            border: isArchived
                              ? "1px solid rgba(var(--danger-rgb),0.18)"
                              : isLocked
                                ? "1px solid rgba(var(--success-rgb),0.18)"
                                : "1px solid var(--borderSoft)",
                            borderLeft: isArchived
                              ? "6px solid rgb(var(--danger-rgb))"
                              : isLocked
                                ? "6px solid rgb(var(--success-rgb))"
                                : "6px solid rgb(var(--warning-rgb))",
                            borderRadius: 18,
                            padding: 18,
                            background: isArchived ? "var(--surfaceSoft)" : "var(--card)",
                            color: "var(--text)",
                            boxShadow: "var(--shadow)",
                            opacity: isArchived ? 0.9 : 1,
                            position: "relative",
                            zIndex: proofMenuOpenId === proof.id ? 10000 : 1,
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
                                    fontSize: 16,
                                    lineHeight: 1.4,
                                    overflowWrap: "anywhere",
                                    wordBreak: "break-word",
                                    minWidth: 0,
                                    maxWidth: "100%",
                                  }}
                                >
                                  {isOpen ? (
                                    proof.content.split("\n").map((line, index) => (
                                      <div
                                        key={index}
                                        style={{
                                          fontSize: index === 0 ? 20 : undefined,
                                          fontWeight: index === 0 ? 900 : 400,
                                          marginBottom: index === 0 ? 6 : 0,
                                          overflowWrap: "anywhere",
                                          wordBreak: "break-word",
                                          minWidth: 0,
                                          maxWidth: "100%",
                                        }}
                                      >
                                        {line}
                                      </div>
                                    ))
                                  ) : (
                                    <div
                                      style={{
                                        fontSize: 20,
                                        fontWeight: 900,
                                        overflowWrap: "anywhere",
                                        wordBreak: "break-word",
                                        minWidth: 0,
                                        maxWidth: "100%",
                                      }}
                                    >
                                      {(proof.content || "").split("\n")[0]}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginTop: 14,
                                  paddingTop: 12,
                                  borderTop: "1px solid var(--borderSoft)",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div className="sub" style={{ opacity: 0.75 }}>
                                  {formatWhen(
                                    offline ? proof.createdAt : proof.created_at,
                                    offline
                                      ? proof.createdTimezoneOffsetMinutes
                                      : (proof as any).created_timezone_offset_minutes
                                  )}
                                </div>

                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    border: isArchived
                                      ? "1px solid rgba(var(--danger-rgb),0.35)"
                                      : isLocked
                                        ? "1px solid rgba(var(--success-rgb),0.35)"
                                        : "1px solid rgba(var(--warning-rgb),0.35)",
                                    background: isArchived
                                      ? "rgba(var(--danger-rgb),0.08)"
                                      : isLocked
                                        ? "rgba(var(--success-rgb),0.08)"
                                        : "rgba(var(--warning-rgb),0.08)",
                                    color: isArchived
                                      ? "var(--dangerTextAlt)"
                                      : isLocked
                                        ? "var(--successTextAlt)"
                                        : "var(--warningText)",
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
                              ref={proofMenuOpenId === proof.id ? proofMenuRef : null}
                            >
                              <button
                                className="btn"
                                onClick={() => setProofMenuOpenId((v) => (v === proof.id ? null : proof.id))}
                                title="Entry actions"
                                disabled={isEditing}
                              >
                                …
                              </button>

                              {proofMenuOpenId === proof.id ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: 44,
                                    zIndex: 9999,
                                    width: 220,
                                    maxWidth: "min(220px, 88vw)",
                                    border: "1px solid var(--borderStrong)",
                                    borderRadius: 14,
                                    background: "var(--card)",
                                    padding: 10,
                                    boxShadow: "var(--shadowSoft)",
                                    display: "grid",
                                    gap: 8,
                                  }}
                                >
                                  {!isLocked ? (
                                    <button
                                      className="btn"
                                      onClick={() => {
                                        if (offline) {
                                          setEditingProofId(proof.id);
                                          setEditDraftContent(proof.content ?? "");
                                          setProofMenuOpenId(null);
                                          setOpenProofId(proof.id);
                                          return;
                                        }

                                        if (!serverProof) return;
                                        startEditEntry(serverProof);
                                      }}
                                      disabled={working}
                                    >
                                      Edit
                                    </button>
                                  ) : null}

                                  {!offline ? (
                                    isArchived ? (
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
                                          archiveEntry(proof.id as number);
                                        }}
                                        disabled={working}
                                      >
                                        {working ? "Working..." : "Archive"}
                                      </button>
                                    )
                                  ) : null}

                                  {!isLocked ? (
                                    <button
                                      className="btn btnDelete"
                                      onClick={() => {
                                        deleteEntry(proof.id);
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
                                border: "1px dashed var(--borderStrong)",
                                background: "var(--surfaceSoft)",
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
                      No entries yet. Tap the + button to add your first update.
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
      {projectNotesOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setProjectNotesOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 720,
              background: "var(--card)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600 }}>
              Project Notes
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              Private (not shared with client)
            </div>

            <textarea
              className="textarea"
              value={projectNotesDraft}
              onChange={(e) => scheduleProjectNotesSave(e.target.value)}
              placeholder="Write notes for this project..."
              style={{
                minHeight: 220,
                fontSize: 14,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setProjectNotesOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {membersOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setMembersOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--card)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "grid",
              gap: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600 }}>
              {orgContext?.organizationName || "Team"}
            </div>

            {membersError && (
              <div style={{ fontSize: 13, color: "var(--dangerTextAlt)" }}>{membersError}</div>
            )}

            {orgContext?.role === "owner" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Invite a member</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    value={inviteEmailDraft}
                    onChange={(e) => setInviteEmailDraft(e.target.value)}
                    placeholder="teammate@example.com"
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: "1px solid var(--borderStrong)",
                      padding: "8px 10px",
                      fontSize: 14,
                    }}
                  />
                  <button
                    className="btn"
                    disabled={inviteSending || !inviteEmailDraft.trim()}
                    onClick={sendInvite}
                  >
                    {inviteSending ? "Sending..." : "Send Invite"}
                  </button>
                </div>
                {inviteError && (
                  <div style={{ fontSize: 13, color: "var(--dangerTextAlt)" }}>{inviteError}</div>
                )}
              </div>
            )}

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                Members{membersLoading ? " (loading...)" : ""}
              </div>
              {orgMembers.map((m) => (
                <div
                  key={m.user_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 14,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--borderSoft)",
                  }}
                >
                  <div>
                    <div>{m.email || m.user_id}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{m.role}</div>
                  </div>
                  {orgContext?.role === "owner" && m.role !== "owner" && (
                    <button
                      className="btn btnDanger"
                      disabled={memberActionBusyId === m.id}
                      onClick={() => removeOrgMember(m.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {orgMembers.length === 0 && !membersLoading && (
                <div style={{ fontSize: 13, opacity: 0.6 }}>No members yet.</div>
              )}
            </div>

            {orgContext?.role === "owner" && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Pending Invites</div>
                {orgPendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 14,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--borderSoft)",
                    }}
                  >
                    <div>{inv.email}</div>
                    <button
                      className="btn btnDanger"
                      disabled={memberActionBusyId === inv.id}
                      onClick={() => revokeInvite(inv.id)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {orgPendingInvites.length === 0 && (
                  <div style={{ fontSize: 13, opacity: 0.6 }}>No pending invites.</div>
                )}
              </div>
            )}

            {orgContext?.role === "owner" && (
              <div
                style={{
                  borderTop: "1px solid var(--borderSoft)",
                  paddingTop: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                {!dissolveConfirmOpen ? (
                  <button
                    className="btn btnDanger"
                    onClick={() => setDissolveConfirmOpen(true)}
                  >
                    Cancel Team &amp; Return to Solo
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      This cancels your team subscription, removes all members, and
                      moves all team projects back to your individual account. Type{" "}
                      <b>{orgContext?.organizationName}</b> to confirm.
                    </div>
                    <input
                      type="text"
                      value={dissolveConfirmName}
                      onChange={(e) => setDissolveConfirmName(e.target.value)}
                      placeholder={orgContext?.organizationName || ""}
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--borderStrong)",
                        padding: "8px 10px",
                        fontSize: 14,
                      }}
                    />
                    {dissolveError && (
                      <div style={{ fontSize: 13, color: "var(--dangerTextAlt)" }}>
                        {dissolveError}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        className="btn"
                        onClick={() => {
                          setDissolveConfirmOpen(false);
                          setDissolveConfirmName("");
                          setDissolveError("");
                        }}
                      >
                        Never mind
                      </button>
                      <button
                        className="btn btnDanger"
                        disabled={
                          dissolveBusy ||
                          dissolveConfirmName.trim() !== orgContext?.organizationName
                        }
                        onClick={confirmDissolveOrganization}
                      >
                        {dissolveBusy ? "Cancelling..." : "Confirm Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setMembersOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {upgradeOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setUpgradeOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "var(--card)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600 }}>Upgrade to Team</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              $69/month, up to 5 users, 14-day trial.
            </div>

            {!orgContext?.organizationId && (
              <input
                type="text"
                value={upgradeTeamName}
                onChange={(e) => setUpgradeTeamName(e.target.value)}
                placeholder="What's your team called?"
                style={{
                  borderRadius: 10,
                  border: "1px solid var(--borderStrong)",
                  padding: "8px 10px",
                  fontSize: 14,
                }}
              />
            )}

            {upgradeError && (
              <div style={{ fontSize: 13, color: "var(--dangerTextAlt)" }}>{upgradeError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setUpgradeOpen(false)}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={
                  upgradeSubmitting ||
                  (!orgContext?.organizationId && !upgradeTeamName.trim())
                }
                onClick={submitUpgrade}
              >
                {upgradeSubmitting ? "Starting checkout..." : "Continue to Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


