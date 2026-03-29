// /lib/offlineSendOutbox.ts

export type OfflineSendStatus = "pending" | "syncing" | "handed_off";

export type OfflineSendRecord = {
  id: string;
  idempotencyKey: string;
  projectId: string;
  toEmail: string;
  includeArchived: boolean;

  status: OfflineSendStatus;

  createdAt: string;
  updatedAt: string;

  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;

  serverJobId: string | null;
};

const DB_NAME = "buildproof-offline";
const DB_VERSION = 4;
const STORE_NAME = "send_outbox";

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function generateId() {
  return crypto.randomUUID();
}

export function createSendIdempotencyKey() {
  return `send_${crypto.randomUUID()}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Ensure send_outbox exists
      if (!db.objectStoreNames.contains("send_outbox")) {
        const sendStore = db.createObjectStore("send_outbox", { keyPath: "id" });

        sendStore.createIndex("status", "status", { unique: false });
        sendStore.createIndex("createdAt", "createdAt", { unique: false });
        sendStore.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
      }

      // Ensure attachment_outbox exists
      if (!db.objectStoreNames.contains("attachment_outbox")) {
        const attachmentStore = db.createObjectStore("attachment_outbox", { keyPath: "id" });

        attachmentStore.createIndex("status", "status", { unique: false });
        attachmentStore.createIndex("createdAt", "createdAt", { unique: false });
        attachmentStore.createIndex("proofId", "proofId", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

function promisifyRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
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

export async function createOfflineSendRecord(input: {
  projectId: string;
  toEmail: string;
  includeArchived: boolean;
  idempotencyKey?: string;
}): Promise<OfflineSendRecord> {
  const now = new Date().toISOString();

  const record: OfflineSendRecord = {
    id: generateId(),
    idempotencyKey: input.idempotencyKey || createSendIdempotencyKey(),
    projectId: input.projectId,
    toEmail: input.toEmail.trim().toLowerCase(),
    includeArchived: Boolean(input.includeArchived),

    status: "pending",

    createdAt: now,
    updatedAt: now,

    syncAttemptCount: 0,
    lastSyncAttemptAt: null,
    lastError: null,

    serverJobId: null,
  };

  return withStore("readwrite", async (store) => {
    await promisifyRequest(store.add(record));
    return record;
  });
}

export async function getAllOfflineSendRecords(): Promise<OfflineSendRecord[]> {
  return withStore("readonly", async (store) => {
    const records = (await promisifyRequest(store.getAll())) as OfflineSendRecord[];
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

export async function getFlushableOfflineSendRecords(): Promise<OfflineSendRecord[]> {
  const records = await getAllOfflineSendRecords();

  return records.filter(
    (record) => record.status === "pending" || record.status === "syncing"
  );
}

export async function getOfflineSendRecordById(
  id: string
): Promise<OfflineSendRecord | null> {
  return withStore("readonly", async (store) => {
    const result = (await promisifyRequest(store.get(id))) as OfflineSendRecord | undefined;
    return result || null;
  });
}

export async function updateOfflineSendRecord(
  id: string,
  updater: (record: OfflineSendRecord) => OfflineSendRecord
): Promise<OfflineSendRecord> {
  return withStore("readwrite", async (store) => {
    const current = (await promisifyRequest(store.get(id))) as OfflineSendRecord | undefined;

    if (!current) {
      throw new Error("Offline send record not found");
    }

    const updated = updater({
      ...current,
      updatedAt: new Date().toISOString(),
    });

    await promisifyRequest(store.put(updated));
    return updated;
  });
}

export async function markOfflineSendSyncing(id: string): Promise<OfflineSendRecord> {
  return updateOfflineSendRecord(id, (record) => ({
    ...record,
    status: "syncing",
    syncAttemptCount: record.syncAttemptCount + 1,
    lastSyncAttemptAt: new Date().toISOString(),
    lastError: null,
  }));
}

export async function markOfflineSendPending(
  id: string,
  errorMessage: string | null = null
): Promise<OfflineSendRecord> {
  return updateOfflineSendRecord(id, (record) => ({
    ...record,
    status: "pending",
    lastError: errorMessage,
  }));
}

export async function markOfflineSendHandedOff(
  id: string,
  serverJobId: string
): Promise<OfflineSendRecord> {
  return updateOfflineSendRecord(id, (record) => ({
    ...record,
    status: "handed_off",
    serverJobId,
    lastError: null,
  }));
}

export async function removeOfflineSendRecord(id: string): Promise<void> {
  await withStore("readwrite", async (store) => {
    await promisifyRequest(store.delete(id));
  });
}