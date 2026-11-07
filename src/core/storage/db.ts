import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Highlight, VenueConfig } from "../domain/types";

export interface DemoClip {
  id: string;
  name: string;
  createdAt: number;
  durationSec: number;
  blob: Blob;
}

/**
 * Video bytes are persisted as ArrayBuffer, not Blob: WebKit (iOS Safari, some private modes)
 * rejects Blobs in IndexedDB with "Error preparing Blob/File data to be stored in object store".
 */
export interface StoredBytes {
  bytes: ArrayBuffer;
  mime: string;
}
export type StoredHighlight = Omit<Highlight, "blob"> & StoredBytes;
export type StoredDemoClip = Omit<DemoClip, "blob"> & StoredBytes;

export async function toStored<T extends { blob: Blob }>(row: T): Promise<Omit<T, "blob"> & StoredBytes> {
  const { blob, ...rest } = row;
  return { ...rest, bytes: await blob.arrayBuffer(), mime: blob.type };
}

export function fromStored<T extends StoredBytes>(row: T): Omit<T, "bytes" | "mime"> & { blob: Blob } {
  const { bytes, mime, ...rest } = row;
  return { ...rest, blob: new Blob([bytes], { type: mime }) };
}

interface BHSchema extends DBSchema {
  kv: { key: string; value: unknown };
  drafts: { key: string; value: VenueConfig };
  highlights: { key: string; value: StoredHighlight; indexes: { byTable: string; byCreated: number } };
  demoClips: { key: string; value: StoredDemoClip };
}

let dbPromise: Promise<IDBPDatabase<BHSchema>> | null = null;

/** Single IndexedDB for the app. Opening can fail (private mode, blocked storage) — callers must handle it. */
export function getDb(): Promise<IDBPDatabase<BHSchema>> {
  if (!dbPromise) {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB không khả dụng"));
    dbPromise = openDB<BHSchema>("billiards-highlight", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("kv");
          db.createObjectStore("drafts");
        }
        // v2: video stores switched from Blob to ArrayBuffer — recreate them.
        for (const name of ["highlights", "demoClips"] as const) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
        const h = db.createObjectStore("highlights", { keyPath: "id" });
        h.createIndex("byTable", "tableId");
        h.createIndex("byCreated", "createdAt");
        db.createObjectStore("demoClips", { keyPath: "id" });
      },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Try to keep stored highlights from being evicted under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
