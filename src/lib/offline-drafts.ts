const DB_NAME = "ohda-offline";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

type DraftRecord<T> = {
  key: string;
  value: T;
  updatedAt: number;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح التخزين المحلي"));
  });
}

export async function saveOfflineDraft<T>(key: string, value: T) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ key, value, updatedAt: Date.now() } satisfies DraftRecord<T>);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ المسودة المحلية"));
    });
  } finally {
    db.close();
  }
}

export async function loadOfflineDraft<T>(key: string) {
  const db = await openDatabase();
  try {
    return await new Promise<DraftRecord<T> | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as DraftRecord<T> | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("تعذر قراءة المسودة المحلية"));
    });
  } finally {
    db.close();
  }
}

export async function deleteOfflineDraft(key: string) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حذف المسودة المحلية"));
    });
  } finally {
    db.close();
  }
}
