"use client";

const DB_NAME = "buildproof-offline";
const DB_VERSION = 3;

const PROOF_OUTBOX_STORE = "proof_outbox";

export type OfflineProofStatus = "pending" | "syncing" | "failed";

export type OfflineProofRecord = {
  id: string;
  projectId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  status: OfflineProofStatus;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
};

function promisifyRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("send_outbox")) {
        db.createObjectStore("send_outbox", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("attachment_outbox")) {
        db.createObjectStore("attachment_outbox", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(PROOF_OUTBOX_STORE)) {
        const store = db.createObjectStore(PROOF_OUTBOX_STORE, { keyPath: "id" });
        store.createIndex("by_projectId", "projectId", { unique: false });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function makeOfflineProofId() {
  return `proof_local_${crypto.randomUUID()}`;
}

export async function createOfflineProof(input: {
  projectId: string;
  content: string;
}): Promise<OfflineProofRecord> {
  const now = new Date().toISOString();

  const record: OfflineProofRecord = {
    id: makeOfflineProofId(),
    projectId: input.projectId,
    content: input.content,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    syncAttemptCount: 0,
    lastSyncAttemptAt: null,
    lastError: null,
  };

  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);

    await promisifyRequest(store.put(record));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save offline proof"));
      tx.onabort = () => reject(tx.error ?? new Error("Offline proof save aborted"));
    });

    return record;
  } finally {
    db.close();
  }
}

export async function listOfflineProofsForProject(projectId: string): Promise<OfflineProofRecord[]> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readonly");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);
    const index = store.index("by_projectId");

    const records = await promisifyRequest(index.getAll(projectId));

    return [...records].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  } finally {
    db.close();
  }
}

export async function listPendingOfflineProofs(): Promise<OfflineProofRecord[]> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readonly");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);
    const allRecords = await promisifyRequest<OfflineProofRecord[]>(store.getAll());

    return allRecords
      .filter((record) => record.status === "pending" || record.status === "failed")
      .sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  } finally {
    db.close();
  }
}

export async function markOfflineProofSyncing(id: string): Promise<void> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);
    const existing = await promisifyRequest<OfflineProofRecord | undefined>(store.get(id));

    if (!existing) return;

    const updated: OfflineProofRecord = {
      ...existing,
      status: "syncing",
      updatedAt: new Date().toISOString(),
      lastSyncAttemptAt: new Date().toISOString(),
      lastError: null,
      syncAttemptCount: existing.syncAttemptCount + 1,
    };

    await promisifyRequest(store.put(updated));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to mark proof syncing"));
      tx.onabort = () => reject(tx.error ?? new Error("Mark proof syncing aborted"));
    });
  } finally {
    db.close();
  }
}

export async function markOfflineProofFailed(id: string, error: string): Promise<void> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);
    const existing = await promisifyRequest<OfflineProofRecord | undefined>(store.get(id));

    if (!existing) return;

    const updated: OfflineProofRecord = {
      ...existing,
      status: "failed",
      updatedAt: new Date().toISOString(),
      lastError: error,
    };

    await promisifyRequest(store.put(updated));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to mark proof failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Mark proof failed aborted"));
    });
  } finally {
    db.close();
  }
}

export async function deleteOfflineProof(id: string): Promise<void> {
  const db = await openOfflineDb();

  try {
    const tx = db.transaction(PROOF_OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(PROOF_OUTBOX_STORE);

    await promisifyRequest(store.delete(id));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete offline proof"));
      tx.onabort = () => reject(tx.error ?? new Error("Delete offline proof aborted"));
    });
  } finally {
    db.close();
  }
}