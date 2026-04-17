const DB_NAME = "buildproof-offline";
const STORE_NAME = "offline_approval_sends";

export type OfflineApprovalSendStatus =
    | "pending"
    | "processing"
    | "failed";

export type OfflineApprovalSendRecord = {
  id: string;
  approvalId: string | null;
  offlineApprovalId: string | null;
  projectId: string;
  expectedAttachmentCount: number;
  createdAt: string;
  updatedAt: string;
  status: OfflineApprovalSendStatus;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
  sendIdempotencyKey: string;
};

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const firstRequest = indexedDB.open(DB_NAME);

        firstRequest.onerror = () => reject(firstRequest.error);

        firstRequest.onsuccess = () => {
            const db = firstRequest.result;

            if (db.objectStoreNames.contains(STORE_NAME)) {
                resolve(db);
                return;
            }

            const nextVersion = db.version + 1;
            db.close();

            const upgradeRequest = indexedDB.open(DB_NAME, nextVersion);

            upgradeRequest.onerror = () => reject(upgradeRequest.error);

            upgradeRequest.onupgradeneeded = () => {
                const upgradeDb = upgradeRequest.result;

                if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
                    const store = upgradeDb.createObjectStore(STORE_NAME, {
                        keyPath: "id",
                    });
                    store.createIndex("by_status", "status", { unique: false });
                    store.createIndex("by_approvalId", "approvalId", { unique: false });
                    store.createIndex("by_offlineApprovalId", "offlineApprovalId", {
                        unique: false,
                    });
                    store.createIndex("by_projectId", "projectId", { unique: false });
                }
            };

            upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
        };
    });
}

function txDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export function createOfflineApprovalSendId(): string {
    return `offline-approval-send-${crypto.randomUUID()}`;
}

export function createApprovalSendIdempotencyKey(): string {
    return `approval-send-${crypto.randomUUID()}`;
}

export async function putOfflineApprovalSend(
    record: OfflineApprovalSendRecord
): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    await txDone(tx);
    db.close();
}

export async function getOfflineApprovalSend(
    id: string
): Promise<OfflineApprovalSendRecord | null> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);

    const result = await new Promise<OfflineApprovalSendRecord | null>(
        (resolve, reject) => {
            request.onsuccess = () =>
                resolve((request.result as OfflineApprovalSendRecord) ?? null);
            request.onerror = () => reject(request.error);
        }
    );

    await txDone(tx);
    db.close();
    return result;
}

export async function getPendingOfflineApprovalSends(): Promise<
    OfflineApprovalSendRecord[]
> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("by_status");
    const request = index.getAll(IDBKeyRange.only("pending"));

    const result = await new Promise<OfflineApprovalSendRecord[]>(
        (resolve, reject) => {
            request.onsuccess = () =>
                resolve((request.result as OfflineApprovalSendRecord[]) ?? []);
            request.onerror = () => reject(request.error);
        }
    );

    await txDone(tx);
    db.close();
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markOfflineApprovalSendProcessing(
    id: string
): Promise<void> {
    const existing = await getOfflineApprovalSend(id);
    if (!existing) return;

    const now = new Date().toISOString();

    await putOfflineApprovalSend({
        ...existing,
        status: "processing",
        updatedAt: now,
        syncAttemptCount: existing.syncAttemptCount + 1,
        lastSyncAttemptAt: now,
        lastError: null,
    });
}

export async function markOfflineApprovalSendPending(
    id: string,
    lastError: string | null = null
): Promise<void> {
    const existing = await getOfflineApprovalSend(id);
    if (!existing) return;

    await putOfflineApprovalSend({
        ...existing,
        status: "pending",
        updatedAt: new Date().toISOString(),
        lastError,
    });
}

export async function markOfflineApprovalSendFailed(
    id: string,
    lastError: string
): Promise<void> {
    const existing = await getOfflineApprovalSend(id);
    if (!existing) return;

    await putOfflineApprovalSend({
        ...existing,
        status: "failed",
        updatedAt: new Date().toISOString(),
        lastError,
    });
}

export async function removeOfflineApprovalSend(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await txDone(tx);
    db.close();
}

export async function updateOfflineApprovalSendIds(args: {
    sendId: string;
    approvalId: string;
    offlineApprovalId: string | null;
}): Promise<void> {
    const existing = await getOfflineApprovalSend(args.sendId);
    if (!existing) return;

    await putOfflineApprovalSend({
        ...existing,
        approvalId: args.approvalId,
        offlineApprovalId: args.offlineApprovalId,
        updatedAt: new Date().toISOString(),
    });
}

export async function hasPendingOfflineApprovalSend(args: {
    approvalId: string | null;
    offlineApprovalId: string | null;
}): Promise<boolean> {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const allRecordsRequest = store.getAll();

    const allRecords = await new Promise<OfflineApprovalSendRecord[]>(
        (resolve, reject) => {
            allRecordsRequest.onsuccess = () =>
                resolve((allRecordsRequest.result as OfflineApprovalSendRecord[]) ?? []);
            allRecordsRequest.onerror = () => reject(allRecordsRequest.error);
        }
    );

    await txDone(tx);
    db.close();

    return allRecords.some((record) => {
        const matchesApprovalId =
            !!args.approvalId && record.approvalId === args.approvalId;

        const matchesOfflineApprovalId =
            !!args.offlineApprovalId &&
            record.offlineApprovalId === args.offlineApprovalId;

        return (
            (matchesApprovalId || matchesOfflineApprovalId) &&
            (record.status === "pending" || record.status === "processing")
        );
    });
}

export async function remapOfflineApprovalSendApprovalId(args: {
    offlineApprovalId: string;
    approvalId: string;
}): Promise<void> {

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const index = tx.objectStore(STORE_NAME).index("by_offlineApprovalId");
    const request = index.getAll(IDBKeyRange.only(args.offlineApprovalId));

    const records = await new Promise<OfflineApprovalSendRecord[]>(
        (resolve, reject) => {
            request.onsuccess = () =>
                resolve((request.result as OfflineApprovalSendRecord[]) ?? []);
            request.onerror = () => reject(request.error);
        }
    );

    const store = tx.objectStore(STORE_NAME);
    const now = new Date().toISOString();

    for (const record of records) {
        store.put({
            ...record,
            approvalId: args.approvalId,
            offlineApprovalId: args.offlineApprovalId,
            updatedAt: now,
        });
    }

    await txDone(tx);
    db.close();
}