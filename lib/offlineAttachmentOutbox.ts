// /lib/offlineAttachmentOutbox.ts

export type OfflineAttachmentStatus = "pending" | "uploading";

export type OfflineAttachmentRecord = {
  id: string;
  projectId: string;
  proofId: number | null;
  offlineProofId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileBlob: Blob;
  status: OfflineAttachmentStatus;
  createdAt: string;
  updatedAt: string;
  uploadAttemptCount: number;
  lastUploadAttemptAt: string | null;
  lastError: string | null;
};

const DB_NAME = "buildproof-offline";
const DB_VERSION = 6;
const STORE_NAME = "attachment_outbox";

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function generateId() {
  return crypto.randomUUID();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;

      const needsSendStore = !db.objectStoreNames.contains("send_outbox");
      const needsAttachmentStore = !db.objectStoreNames.contains(STORE_NAME);
      const needsApprovalAttachmentStore = !db.objectStoreNames.contains("approval_attachment_outbox");
      const needsOfflineApprovalsStore = !db.objectStoreNames.contains("offline_approvals");

      if (
        !needsSendStore &&
        !needsAttachmentStore &&
        !needsApprovalAttachmentStore &&
        !needsOfflineApprovalsStore
      ) {
        resolve(db);
        return;
      }

      const nextVersion = db.version + 1;
      db.close();

      const upgradeReq = indexedDB.open(DB_NAME, nextVersion);

      upgradeReq.onupgradeneeded = () => {
        const upgradeDb = upgradeReq.result;

        if (!upgradeDb.objectStoreNames.contains("send_outbox")) {
          upgradeDb.createObjectStore("send_outbox", { keyPath: "id" });
        }

        if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
          const store = upgradeDb.createObjectStore(STORE_NAME, { keyPath: "id" });

          store.createIndex("status", "status", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("proofId", "proofId", { unique: false });
          store.createIndex("offlineProofId", "offlineProofId", { unique: false });
        }

        if (!upgradeDb.objectStoreNames.contains("approval_attachment_outbox")) {
          const store = upgradeDb.createObjectStore("approval_attachment_outbox", {
            keyPath: "id",
          });

          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_approvalId", "approvalId", { unique: false });
          store.createIndex("by_offlineApprovalId", "offlineApprovalId", {
            unique: false,
          });
          store.createIndex("by_createdAt", "createdAt", { unique: false });
        }

        if (!upgradeDb.objectStoreNames.contains("offline_approvals")) {
          const store = upgradeDb.createObjectStore("offline_approvals", {
            keyPath: "id",
          });

          store.createIndex("projectId", "projectId", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }
      };

      upgradeReq.onsuccess = () => resolve(upgradeReq.result);
      upgradeReq.onerror = () =>
        reject(upgradeReq.error || new Error("Failed to upgrade IndexedDB"));
    };

    request.onerror = () =>
      reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

function promisify<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();

  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);

    const result = await run(store);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });

    return result;
  } finally {
    db.close();
  }
}

export async function createOfflineAttachmentRecord(input: {
  projectId: string;
  proofId?: number;
  offlineProofId?: string;
  file: File;
}): Promise<OfflineAttachmentRecord> {
  const now = new Date().toISOString();

  const record: OfflineAttachmentRecord = {
    id: generateId(),
    projectId: input.projectId,
    proofId: input.proofId ?? null,
    offlineProofId: input.offlineProofId,
    fileName: input.file.name,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    fileBlob: input.file,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    uploadAttemptCount: 0,
    lastUploadAttemptAt: null,
    lastError: null,
  };

  return withStore("readwrite", async (store) => {
    await promisify(store.add(record));
    return record;
  });
}

export async function getAllOfflineAttachmentRecords(): Promise<OfflineAttachmentRecord[]> {
  return withStore("readonly", async (store) => {
    const records = (await promisify(store.getAll())) as OfflineAttachmentRecord[];
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

export async function getPendingOfflineAttachments(): Promise<OfflineAttachmentRecord[]> {
  const all = await getAllOfflineAttachmentRecords();
  return all.filter((r) => r.status === "pending");
}

export async function markAttachmentUploading(
  id: string
): Promise<OfflineAttachmentRecord> {
  return withStore("readwrite", async (store) => {
    const rec = (await promisify(store.get(id))) as OfflineAttachmentRecord | undefined;

    if (!rec) {
      throw new Error("Offline attachment record not found");
    }

    const updated: OfflineAttachmentRecord = {
      ...rec,
      status: "uploading",
      uploadAttemptCount: rec.uploadAttemptCount + 1,
      lastUploadAttemptAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await promisify(store.put(updated));
    return updated;
  });
}

export async function markAttachmentPending(
  id: string,
  error: string | null
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const rec = (await promisify(store.get(id))) as OfflineAttachmentRecord | undefined;

    if (!rec) {
      throw new Error("Offline attachment record not found");
    }

    const updated: OfflineAttachmentRecord = {
      ...rec,
      status: "pending",
      lastError: error,
      updatedAt: new Date().toISOString(),
    };

    await promisify(store.put(updated));
  });
}

export async function removeOfflineAttachmentRecord(id: string): Promise<void> {
  await withStore("readwrite", async (store) => {
    await promisify(store.delete(id));
  });
}

export async function attachOfflineAttachmentsToProof(
  offlineProofId: string,
  proofId: number
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const all = (await promisify(store.getAll())) as OfflineAttachmentRecord[];

    const matches = all.filter((rec) => rec.offlineProofId === offlineProofId);

    for (const rec of matches) {
      const updated: OfflineAttachmentRecord = {
        ...rec,
        proofId,
        offlineProofId: undefined,
        updatedAt: new Date().toISOString(),
        lastError: null,
      };

      await promisify(store.put(updated));
    }
  });
}