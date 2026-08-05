export type CachedAttachment = {
  id: string;
  proof_id: number;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  path: string;
};

const PREFIX = "buildproof-attachment-cache:";

function getKey(proofId: number) {
  return `${PREFIX}${proofId}`;
}

export function saveCachedAttachments(proofId: number, attachments: CachedAttachment[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getKey(proofId), JSON.stringify(attachments));
  } catch (error) {
    console.error("Failed to save attachment cache", error);
  }
}

export function loadCachedAttachments(proofId: number): CachedAttachment[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(getKey(proofId));
    if (!raw) return [];
    return JSON.parse(raw) as CachedAttachment[];
  } catch {
    return [];
  }
}

// Added 2026-08-06, same account-isolation-on-logout fix as
// offlineDashboardCache.ts / offlineRecentProjects.ts -- these blobs are
// only ever reachable via a proof_id surfaced by a cached project that's
// now being cleared anyway, but sweeping them too avoids leaving orphaned
// data behind.
export function clearAllCachedAttachments() {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (error) {
    console.error("Failed to clear attachment cache", error);
  }
}