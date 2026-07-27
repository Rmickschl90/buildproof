// /lib/offlineSendOutbox.ts

// "failed" (2026-07-27) is a genuine terminal state -- added after a
// permanently-invalid recipient address (a bad test email) got stuck
// retrying forever, since previously any failure just reset status back to
// "pending" with no cap and no way to ever stop. getFlushableOfflineSendRecords()
// below deliberately does NOT include "failed" -- once a record reaches this
// state it is done being auto-retried, full stop. See markOfflineSendFailed
// and lib/offlineSendFlush.ts's failure classification for how a record gets
// here.
export type OfflineSendStatus = "pending" | "syncing" | "handed_off" | "failed";

export type OfflineSendRecord = {
  id: string;
  idempotencyKey: string;
  projectId: string;
  toEmail: string;
  includeArchived: boolean;
  creatingUserId?: string;

  status: OfflineSendStatus;

  createdAt: string;
  updatedAt: string;

  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
  waitReason: string | null;

  serverJobId: string | null;
};

const DB_NAME = "buildproof-offline";
const DB_VERSION = 6;
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

    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => {
      const db = request.result;

      const needsSendStore = !db.objectStoreNames.contains("send_outbox");
      const needsAttachmentStore = !db.objectStoreNames.contains("attachment_outbox");

      if (!needsSendStore && !needsAttachmentStore) {
        resolve(db);
        return;
      }

      const nextVersion = db.version + 1;
      db.close();

      const upgradeReq = indexedDB.open(DB_NAME, nextVersion);

      upgradeReq.onupgradeneeded = () => {
        const upgradeDb = upgradeReq.result;

        if (!upgradeDb.objectStoreNames.contains("send_outbox")) {
          const sendStore = upgradeDb.createObjectStore("send_outbox", { keyPath: "id" });

          sendStore.createIndex("status", "status", { unique: false });
          sendStore.createIndex("createdAt", "createdAt", { unique: false });
          sendStore.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
        }

        if (!upgradeDb.objectStoreNames.contains("attachment_outbox")) {
          const attachmentStore = upgradeDb.createObjectStore("attachment_outbox", { keyPath: "id" });

          attachmentStore.createIndex("status", "status", { unique: false });
          attachmentStore.createIndex("createdAt", "createdAt", { unique: false });
          attachmentStore.createIndex("proofId", "proofId", { unique: false });
        }
      };

      upgradeReq.onsuccess = () => resolve(upgradeReq.result);
      upgradeReq.onerror = () =>
        reject(upgradeReq.error || new Error("Failed to upgrade IndexedDB"));
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
  creatingUserId?: string;
}): Promise<OfflineSendRecord> {
  const now = new Date().toISOString();

  const record: OfflineSendRecord = {
    id: generateId(),
    idempotencyKey: input.idempotencyKey || createSendIdempotencyKey(),
    projectId: input.projectId,
    toEmail: input.toEmail.trim().toLowerCase(),
    includeArchived: Boolean(input.includeArchived),
    creatingUserId: input.creatingUserId,

    status: "pending",

    createdAt: now,
    updatedAt: now,

    syncAttemptCount: 0,
    lastSyncAttemptAt: null,
    lastError: null,
    waitReason: null,

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

  // "handed_off" is deliberately included here (2026-07-27) -- this was the
  // real root cause behind a send getting permanently stuck. A record only
  // reaches "handed_off" after a server job id already exists, and the flush
  // loop's own logic (in lib/offlineSendFlush.ts) already knows how to resume
  // a handed-off record via its stored serverJobId. But this function
  // previously excluded "handed_off" entirely, so once a record landed there
  // it could never be picked up by any future automatic flush again -- not
  // on reconnect, not on the 3-second indicator poll, nothing. If that
  // happened to coincide with the send job's server-side status sitting at
  // "retrying" (send_jobs has its own independent 5-attempt cap +
  // next_retry_at schedule in app/api/send/process-job/route.ts, driven
  // entirely by client calls -- there is no server cron), the job would just
  // sit one attempt short of its own terminal "failed" state forever, since
  // nothing client-side would ever call process-job again to push it there.
  // Confirmed live on staging: a record from an invalid test-email send sat
  // at status "handed_off" / server job status "retrying" (attempt 4 of 5)
  // for 8+ hours, invisible to every flush attempt in between.
  return records.filter(
    (record) =>
      record.status === "pending" ||
      record.status === "syncing" ||
      record.status === "handed_off"
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
    waitReason: null,
  }));
}

export async function markOfflineSendPending(
  id: string,
  errorMessage: string | null = null,
  waitReason: string | null = null
): Promise<OfflineSendRecord> {
  return updateOfflineSendRecord(id, (record) => ({
    ...record,
    status: "pending",
    lastError: errorMessage,
    waitReason,
  }));
}

export async function markOfflineSendFailed(
  id: string,
  errorMessage: string
): Promise<OfflineSendRecord> {
  return updateOfflineSendRecord(id, (record) => ({
    ...record,
    status: "failed",
    lastError: errorMessage,
    waitReason: null,
  }));
}

export async function getFailedOfflineSendRecords(): Promise<OfflineSendRecord[]> {
  const records = await getAllOfflineSendRecords();
  return records.filter((record) => record.status === "failed");
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
    waitReason: null,
  }));
}

export async function removeOfflineSendRecord(id: string): Promise<void> {
  await withStore("readwrite", async (store) => {
    await promisifyRequest(store.delete(id));
  });
}

export async function remapOfflineSendProjectId(
  oldProjectId: string,
  newProjectId: string
): Promise<void> {
  await withStore("readwrite", async (store) => {
    const all = (await promisifyRequest(store.getAll())) as OfflineSendRecord[];

    const matches = all.filter((rec) => rec.projectId === oldProjectId);

    for (const rec of matches) {
      const updated: OfflineSendRecord = {
        ...rec,
        projectId: newProjectId,
        updatedAt: new Date().toISOString(),
      };

      await promisifyRequest(store.put(updated));
    }
  });
}