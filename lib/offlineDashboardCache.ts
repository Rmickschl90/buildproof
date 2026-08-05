export type CachedDashboardProject = {
  project: {
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
  proofs: Array<{
    id: number;
    content: string;
    created_at: string;
    project_id: string;
    locked_at: string | null;
    deleted_at?: string | null;
    deleted_by?: string | null;
    updated_at?: string | null;
  }>;
  approvals: Array<{
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
  }>;
  cachedAt: string;
};

const STORAGE_PREFIX = "buildproof-dashboard-cache:";

function getKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function saveCachedDashboardProject(data: CachedDashboardProject | null | undefined) {
  if (typeof window === "undefined") return;

  if (!data || !data.project || !data.project.id) {
    console.warn("Skipped invalid dashboard cache write", data);
    return;
  }

  console.log("🧱 SAVE CACHE HELPER", {
  projectId: data.project.id,
  proofCount: data.proofs.length,
  approvalCount: data.approvals.length,
  proofIds: data.proofs.map((p) => p.id),
});

if (data.proofs.length === 0) {
  console.log("🧱 EMPTY CACHE WRITE STACK", new Error().stack);
}

  try {
    window.localStorage.setItem(getKey(data.project.id), JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save dashboard cache", error);
  }
}

export function loadCachedDashboardProject(projectId: string): CachedDashboardProject | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getKey(projectId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedDashboardProject;

    if (!parsed?.project?.id) return null;
    return parsed;
  } catch (error) {
    console.error("Failed to load dashboard cache", error);
    return null;
  }
}

export function removeCachedDashboardProject(projectId: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getKey(projectId));
  } catch (error) {
    console.error("Failed to remove dashboard cache", error);
  }
}

// Added 2026-08-06: logout() never cleared any of this account-scoped local
// cache, so a second, different account signing in on the same device (the
// exact scenario a shared/reused device or the Team invite flow produces)
// could have a stale project id restored on first load -- surfacing a
// confusing "not authorized" error for a project that was never theirs --
// and, more importantly, could see a previous account's cached project
// titles/client contact info still sitting in localStorage. Sweeps every
// buildproof-dashboard-cache:* entry rather than tracking ids, since
// nothing else needs these keys once logout starts.
export function clearAllCachedDashboardProjects() {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.error("Failed to clear dashboard cache", error);
  }
}