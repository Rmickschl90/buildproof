const DB_NAME = "buildproof-offline";
const DB_VERSION = 6;

const STORE_NAME = "offline_approvals";

export type OfflineApprovalRecord = {
    id: string;
    projectId: string;
    title: string;
    approvalType: string;
    description: string;
    recipientName: string;
    recipientEmail: string;
    recipientSource?: "project" | "custom";
    costDelta: number | null;
    scheduleDelta: string | null;
    dueAt?: string | null;
    createdAt: number;
    updatedAt: number;
    createdTimezoneId: string | null;
    createdTimezoneOffsetMinutes: number | null;
    status: "pending" | "syncing" | "synced" | "failed";
};

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);

        request.onsuccess = () => {
            const db = request.result;

            // 🔥 CRITICAL FIX: ensure store exists
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.close();

                const upgradeReq = indexedDB.open(DB_NAME, db.version + 1);

                upgradeReq.onupgradeneeded = () => {
                    const upgradeDb = upgradeReq.result;

                    if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
                        const store = upgradeDb.createObjectStore(STORE_NAME, {
                            keyPath: "id",
                        });

                        store.createIndex("projectId", "projectId", { unique: false });
                        store.createIndex("status", "status", { unique: false });
                    }
                };

                upgradeReq.onsuccess = () => resolve(upgradeReq.result);
                upgradeReq.onerror = () => reject(upgradeReq.error);
            } else {
                resolve(db);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

export function createTempApprovalId(): string {
    return `offline-${crypto.randomUUID()}`;
}

export async function addOfflineApproval(
    record: Omit<
        OfflineApprovalRecord,
        "createdAt" | "updatedAt" | "createdTimezoneId" | "createdTimezoneOffsetMinutes" | "status"
    >
): Promise<void> {
    const db = await openDb();
    const nowDate = new Date();
    const now = nowDate.getTime();

    const createdTimezoneId =
        typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
            : null;

    const createdTimezoneOffsetMinutes = nowDate.getTimezoneOffset();

    const fullRecord: OfflineApprovalRecord = {
        ...record,
        createdAt: now,
        updatedAt: now,
        createdTimezoneId,
        createdTimezoneOffsetMinutes,
        status: "pending",
    };

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.put(fullRecord);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function updateOfflineApproval(
    id: string,
    updates: Partial<OfflineApprovalRecord>
): Promise<void> {
    const db = await openDb();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const existing = getReq.result;
            if (!existing) {
                resolve();
                return;
            }

            const updated: OfflineApprovalRecord = {
                ...existing,
                ...updates,
                updatedAt: Date.now(),
            };

            store.put(updated);
        };

        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getPendingOfflineApprovals(): Promise<OfflineApprovalRecord[]> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("status");

        const req = index.getAll("pending");

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export async function markApprovalSyncing(id: string): Promise<void> {
    return updateOfflineApproval(id, { status: "syncing" });
}

export async function markApprovalSynced(id: string): Promise<void> {
    return updateOfflineApproval(id, { status: "synced" });
}

export async function markApprovalFailed(id: string): Promise<void> {
    return updateOfflineApproval(id, { status: "failed" });
}

export async function claimPendingOfflineApproval(
    id: string
): Promise<OfflineApprovalRecord | null> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const existing = getReq.result as OfflineApprovalRecord | undefined;

            if (!existing || existing.status !== "pending") {
                resolve(null);
                return;
            }

            const updated: OfflineApprovalRecord = {
                ...existing,
                status: "syncing",
                updatedAt: Date.now(),
            };

            store.put(updated);
            resolve(updated);
        };

        getReq.onerror = () => reject(getReq.error);
        tx.onerror = () => reject(tx.error);
    });
}

export async function removeOfflineApproval(id: string): Promise<void> {
    const db = await openDb();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listOfflineApprovalsForProject(
    projectId: string
): Promise<OfflineApprovalRecord[]> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("projectId");

        const req = index.getAll(projectId);

        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export async function remapOfflineApprovalProjectId(
  oldProjectId: string,
  newProjectId: string
): Promise<void> {
  const db = await openDb();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("projectId");

    const req = index.getAll(oldProjectId);

    req.onsuccess = () => {
      const records = (req.result || []) as OfflineApprovalRecord[];

      for (const record of records) {
        store.put({
          ...record,
          projectId: newProjectId,
          updatedAt: Date.now(),
        });
      }
    };

    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

