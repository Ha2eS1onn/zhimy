/**
 * 本地缩略图缓存（IndexedDB）。
 *
 * 设计前提：原图不上传云端，只在本次提问里交给模型；聊天记录需要一张小的
 * 缩略图让刷新后仍能认出题目，于是存进当前浏览器的 IndexedDB。
 *
 * - 换设备 / 无痕窗口 / 清站点数据后读不到缩略图，属于预期行为；
 * - IndexedDB 不可用（SSR、隐私模式、配额满）时所有 API 静默降级，不抛错；
 * - 最多保留 200 条，超出按 createdAt 删最旧。
 */

export type ThumbnailKind = "message" | "source";

export interface StoredThumbnail {
  id: string;
  dataUrl: string;
  name: string | null;
  kind: ThumbnailKind;
  createdAt: string;
}

export interface ThumbnailInput {
  id: string;
  dataUrl: string;
  name?: string | null;
  kind: ThumbnailKind;
}

const DB_NAME = "zhimy-media";
const DB_VERSION = 1;
const STORE_NAME = "thumbnails";
export const MAX_STORED_THUMBNAILS = 200;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("kind", "kind");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function debug(message: string, error?: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[media] ${message}`, error);
  }
}

/** 写入一条缩略图；失败静默，并顺带把总量裁剪到上限。 */
export async function saveThumbnail(input: ThumbnailInput): Promise<void> {
  const record: StoredThumbnail = {
    id: input.id,
    dataUrl: input.dataUrl,
    name: input.name ?? null,
    kind: input.kind,
    createdAt: new Date().toISOString(),
  };
  const saved = await writeRecord(record);
  if (saved) void pruneThumbnails();
}

/** 读取一条缩略图；不存在或存储不可用时返回 null。 */
export async function getThumbnail(id: string): Promise<StoredThumbnail | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as StoredThumbnail | undefined) ?? null);
      request.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch (error) {
      debug("读取缩略图失败", error);
      resolve(null);
    }
  });
}

/** 删除指定缩略图（消息落库失败、或清理历史时用）。 */
export async function deleteThumbnail(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => resolve();
      transaction.onerror = () => resolve();
    } catch (error) {
      debug("删除缩略图失败", error);
      resolve();
    }
  });
}

/**
 * 清空本地缩略图：不传 kind 清全部（账号切换），
 * 传 "message" 只清聊天消息的（清空对话时保留来源缩略图）。
 */
export async function clearThumbnails(kind?: ThumbnailKind): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      if (!kind) {
        store.clear();
      } else {
        const request = store.index("kind").openCursor(IDBKeyRange.only(kind));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => resolve();
      transaction.onerror = () => resolve();
    } catch (error) {
      debug("清空缩略图失败", error);
      resolve();
    }
  });
}

function writeRecord(record: StoredThumbnail): Promise<boolean> {
  return new Promise((resolve) => {
    void openDb().then((db) => {
      if (!db) {
        resolve(false);
        return;
      }
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => resolve(false);
        transaction.onerror = () => resolve(false);
      } catch (error) {
        debug("写入缩略图失败", error);
        resolve(false);
      }
    });
  });
}

/** 按 createdAt 升序删除最旧的记录，直到不超过上限；失败静默。 */
async function pruneThumbnails(limit: number = MAX_STORED_THUMBNAILS): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const excess = countRequest.result - limit;
        if (excess <= 0) return;
        let removed = 0;
        const cursorRequest = store.index("createdAt").openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || removed >= excess) return;
          cursor.delete();
          removed += 1;
          cursor.continue();
        };
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => resolve();
      transaction.onerror = () => resolve();
    } catch (error) {
      debug("裁剪缩略图失败", error);
      resolve();
    }
  });
}
