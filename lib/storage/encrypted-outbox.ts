import type { EncryptedEntryEnvelope, MemoryForm } from "@/lib/contracts";

const DATABASE_NAME = "seedjournal-encrypted-v1";
const DATABASE_VERSION = 1;
const DRAFT_STORE = "drafts";
const OUTBOX_STORE = "outbox";

export type EncryptedOutboxOperation =
  | {
      operationId: string;
      accountId: string;
      createdAt: number;
      kind: "create";
      envelope: EncryptedEntryEnvelope;
    }
  | {
      operationId: string;
      accountId: string;
      createdAt: number;
      kind: "update";
      expectedRevision: number;
      envelope: EncryptedEntryEnvelope;
    }
  | {
      operationId: string;
      accountId: string;
      createdAt: number;
      kind: "complete";
      expectedRevision: number;
      envelope: EncryptedEntryEnvelope;
      completion: {
        id: string;
        memoryForm: MemoryForm;
        growthUnits: 1 | 2 | 4 | 6;
        seed: number;
      };
    }
  | {
      operationId: string;
      accountId: string;
      createdAt: number;
      kind: "delete";
      entryId: string;
      expectedRevision: number;
    };

interface StoredDraft {
  key: string;
  accountId: string;
  envelope: EncryptedEntryEnvelope;
  storedAt: number;
}

export async function putEncryptedDraft(
  accountId: string,
  envelope: EncryptedEntryEnvelope,
): Promise<void> {
  const database = await openDatabase();
  await requestToPromise(
    database
      .transaction(DRAFT_STORE, "readwrite")
      .objectStore(DRAFT_STORE)
      .put({
        key: draftKey(accountId, envelope.id),
        accountId,
        envelope,
        storedAt: Date.now(),
      } satisfies StoredDraft),
  );
  database.close();
}

export async function getEncryptedDraft(
  accountId: string,
  entryId: string,
): Promise<EncryptedEntryEnvelope | null> {
  const database = await openDatabase();
  const result = await requestToPromise<StoredDraft | undefined>(
    database
      .transaction(DRAFT_STORE, "readonly")
      .objectStore(DRAFT_STORE)
      .get(draftKey(accountId, entryId)),
  );
  database.close();
  return result?.envelope ?? null;
}

export async function removeEncryptedDraft(
  accountId: string,
  entryId: string,
): Promise<void> {
  const database = await openDatabase();
  await requestToPromise(
    database
      .transaction(DRAFT_STORE, "readwrite")
      .objectStore(DRAFT_STORE)
      .delete(draftKey(accountId, entryId)),
  );
  database.close();
}

export async function enqueueEncryptedOperation(
  operation: EncryptedOutboxOperation,
): Promise<void> {
  assertOperation(operation);
  const database = await openDatabase();
  await requestToPromise(
    database
      .transaction(OUTBOX_STORE, "readwrite")
      .objectStore(OUTBOX_STORE)
      .put(operation),
  );
  database.close();
}

export async function listEncryptedOperations(
  accountId: string,
): Promise<EncryptedOutboxOperation[]> {
  const database = await openDatabase();
  const index = database
    .transaction(OUTBOX_STORE, "readonly")
    .objectStore(OUTBOX_STORE)
    .index("byAccountCreated");
  const range = IDBKeyRange.bound(
    [accountId, 0],
    [accountId, Number.MAX_SAFE_INTEGER],
  );
  const operations = await requestToPromise<EncryptedOutboxOperation[]>(
    index.getAll(range),
  );
  database.close();
  return operations;
}

export async function removeEncryptedOperation(
  operationId: string,
): Promise<void> {
  const database = await openDatabase();
  await requestToPromise(
    database
      .transaction(OUTBOX_STORE, "readwrite")
      .objectStore(OUTBOX_STORE)
      .delete(operationId),
  );
  database.close();
}

export async function clearEncryptedLocalData(
  accountId: string,
): Promise<void> {
  const database = await openDatabase();
  await Promise.all([
    deleteByAccount(database, DRAFT_STORE, accountId),
    deleteByAccount(database, OUTBOX_STORE, accountId),
  ]);
  database.close();
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Encrypted offline storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        const drafts = database.createObjectStore(DRAFT_STORE, {
          keyPath: "key",
        });
        drafts.createIndex("byAccount", "accountId");
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, {
          keyPath: "operationId",
        });
        outbox.createIndex("byAccount", "accountId");
        outbox.createIndex("byAccountCreated", ["accountId", "createdAt"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open offline storage."));
    request.onblocked = () =>
      reject(new Error("Offline storage is blocked by another tab."));
  });
}

function deleteByAccount(
  database: IDBDatabase,
  storeName: string,
  accountId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.index("byAccount").openKeyCursor(
      IDBKeyRange.only(accountId),
    );
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestToPromise<T = IDBValidKey>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Offline storage request failed."));
  });
}

function draftKey(accountId: string, entryId: string): string {
  return `${accountId}:${entryId}`;
}

function assertOperation(operation: EncryptedOutboxOperation): void {
  if (
    !operation.operationId ||
    !operation.accountId ||
    !Number.isSafeInteger(operation.createdAt)
  ) {
    throw new Error("Invalid encrypted outbox operation.");
  }
}
