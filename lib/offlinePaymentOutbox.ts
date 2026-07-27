const DB_NAME = "buildproof-offline";

const STORE_NAME = "offline_payments";

export type OfflinePaymentRecord = {
    id: string;
    projectId: string;
    amount: number;
    note: string | null;
    paidAt: string;
    creatingUserId?: string;
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

            // Ensure the store exists -- same auto-upgrade pattern used by every
            // other offline outbox in this repo (offlineApprovalOutbox.ts etc.):
            // reopen with version+1 and create the store if it's missing, rather
            // than hardcoding a specific version number that has to stay in sync
            // with every other outbox file's own bump.
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

export function createTempPaymentId(): string {
    return `offline-payment-${crypto.randomUUID()}`;
}

export async function addOfflinePayment(
    record: Omit<
        OfflinePaymentRecord,
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

    const fullRecord: OfflinePaymentRecord = {
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

async function updateOfflinePayment(
    id: string,
    updates: Partial<OfflinePaymentRecord>
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

            const updated: OfflinePaymentRecord = {
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

export async function getPendingOfflinePayments(): Promise<OfflinePaymentRecord[]> {
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

export async function markPaymentFailed(id: string): Promise<void> {
    return updateOfflinePayment(id, { status: "failed" });
}

export async function claimPendingOfflinePayment(
    id: string
): Promise<OfflinePaymentRecord | null> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const getReq = store.get(id);

        getReq.onsuccess = () => {
            const existing = getReq.result as OfflinePaymentRecord | undefined;

            if (!existing || existing.status !== "pending") {
                resolve(null);
                return;
            }

            const updated: OfflinePaymentRecord = {
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

export async function removeOfflinePayment(id: string): Promise<void> {
    const db = await openDb();

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listOfflinePaymentsForProject(
    projectId: string
): Promise<OfflinePaymentRecord[]> {
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

export async function remapOfflinePaymentProjectId(
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
      const records = (req.result || []) as OfflinePaymentRecord[];

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
