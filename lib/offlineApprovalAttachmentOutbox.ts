"use client";

export const OFFLINE_DB_NAME = "buildproof-offline";
export const OFFLINE_DB_VERSION = 3;

const APPROVAL_ATTACHMENT_STORE = "approval_attachment_outbox";

export type OfflineApprovalAttachmentStatus = "pending" | "uploading";

export type OfflineApprovalAttachmentRecord = {
  id: string;
  approvalId?: string | null;
  offlineApprovalId?: string | null;

  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileBlob: Blob;

  status: OfflineApprovalAttachmentStatus;
  createdAt: string;
  updatedAt: string;

  uploadAttemptCount: number;
  lastUploadAttemptAt: string | null;
  lastError: string | null;
};

function getIndexedDb(): IDBFactory {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not available in this environment.");
  }
  return window.indexedDB;
}

function promisifyRequest<T = undefined>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = getIndexedDb().open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(APPROVAL_ATTACHMENT_STORE)) {
        const store = db.createObjectStore(APPROVAL_ATTACHMENT_STORE, {
          keyPath: "id",
        });

        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_approvalId", "approvalId", { unique: false });
        store.createIndex("by_offlineApprovalId", "offlineApprovalId", {
          unique: false,
        });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open offline database."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(APPROVAL_ATTACHMENT_STORE, mode);
    const store = tx.objectStore(APPROVAL_ATTACHMENT_STORE);
    const result = await run(store);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB transaction failed."));
      tx.onabort = () =>
        reject(tx.error ?? new Error("IndexedDB transaction aborted."));
    });

    return result;
  } finally {
    db.close();
  }
}

export function makeOfflineApprovalAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `offline_approval_attachment_${crypto.randomUUID()}`;
  }

  return `offline_approval_attachment_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

export async function addOfflineApprovalAttachment(input: {
  approvalId?: string | null;
  offlineApprovalId?: string | null;
  file: File | Blob;
  fileName: string;
  mimeType: string;
}): Promise<OfflineApprovalAttachmentRecord> {
  const now = new Date().toISOString();

  const record: OfflineApprovalAttachmentRecord = {
    id: makeOfflineApprovalAttachmentId(),
    approvalId: input.approvalId ?? null,
    offlineApprovalId: input.offlineApprovalId ?? null,

    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.file.size,
    fileBlob: input.file,

    status: "pending",
    createdAt: now,
    updatedAt: now,

    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    lastError: null,
  };

  await withStore("readwrite", async (store) => {
    await promisifyRequest(store.put(record));
    return undefined;
  });

  return record;
}

export async function getPendingOfflineApprovalAttachments(): Promise<
  OfflineApprovalAttachmentRecord[]
> {
  return withStore("readonly", async (store) => {
    const records = await promisifyRequest<OfflineApprovalAttachmentRecord[]>(
      store.getAll()
    );

    return (records ?? []).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  });
}

export async function markOfflineApprovalAttachmentUploading(
  id: string
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const existing = await promisifyRequest<OfflineApprovalAttachmentRecord | undefined>(
      store.get(id)
    );

    if (!existing) return;

    const updated: OfflineApprovalAttachmentRecord = {
      ...existing,
      status: "uploading",
      updatedAt: new Date().toISOString(),
      uploadAttemptCount: existing.uploadAttemptCount + 1,
      lastUploadAttemptAt: new Date().toISOString(),
      lastError: null,
    };

    await promisifyRequest(store.put(updated));
    return undefined;
  });
}

export async function markOfflineApprovalAttachmentPending(
  id: string,
  error?: string | null
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const existing = await promisifyRequest<OfflineApprovalAttachmentRecord | undefined>(
      store.get(id)
    );

    if (!existing) return;

    const updated: OfflineApprovalAttachmentRecord = {
      ...existing,
      status: "pending",
      updatedAt: new Date().toISOString(),
      lastError: error ?? null,
    };

    await promisifyRequest(store.put(updated));
    return undefined;
  });
}

export async function removeOfflineApprovalAttachmentRecord(
  id: string
): Promise<void> {
  await withStore("readwrite", async (store) => {
    await promisifyRequest(store.delete(id));
    return undefined;
  });
}

export async function attachServerApprovalIdToOfflineApprovalAttachments(
  offlineApprovalId: string,
  approvalId: string
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const records = await promisifyRequest<OfflineApprovalAttachmentRecord[]>(
      store.getAll()
    );

    const matches = (records ?? []).filter(
      (record) => record.offlineApprovalId === offlineApprovalId
    );

    for (const record of matches) {
      const updated: OfflineApprovalAttachmentRecord = {
        ...record,
        approvalId,
        updatedAt: new Date().toISOString(),
      };

      await promisifyRequest(store.put(updated));
    }

    return undefined;
  });
}

export async function getOfflineApprovalAttachmentsForApproval(params: {
  approvalId?: string | null;
  offlineApprovalId?: string | null;
}): Promise<OfflineApprovalAttachmentRecord[]> {
  return withStore("readonly", async (store) => {
    const records = await promisifyRequest<OfflineApprovalAttachmentRecord[]>(
      store.getAll()
    );

    return (records ?? [])
      .filter((record) => {
        if (params.approvalId && record.approvalId === params.approvalId) {
          return true;
        }

        if (
          params.offlineApprovalId &&
          record.offlineApprovalId === params.offlineApprovalId
        ) {
          return true;
        }

        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}