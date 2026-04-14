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