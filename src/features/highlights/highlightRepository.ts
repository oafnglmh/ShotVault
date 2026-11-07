import type { Highlight } from "@/core/domain/types";
import { fromStored, getDb, requestPersistence, toStored } from "@/core/storage/db";

/**
 * Finished highlights live only on the customer's own device (IndexedDB), with an in-memory
 * mirror so a highlight is never lost just because storage is blocked (private mode, quota).
 */
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const memory = new Map<string, Highlight>();

/** Returns false when the highlight could only be kept in memory (lost on refresh). */
export async function saveHighlight(h: Highlight): Promise<boolean> {
  memory.set(h.id, h);
  try {
    const db = await getDb();
    await db.put("highlights", await toStored(h));
    void requestPersistence();
    return true;
  } catch {
    return false;
  }
}

export async function getHighlight(id: string): Promise<Highlight | undefined> {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const db = await getDb();
    const row = await db.get("highlights", id);
    return row ? fromStored(row) : undefined;
  } catch {
    return undefined;
  }
}

export async function listHighlights(tableId: string): Promise<Highlight[]> {
  const byId = new Map<string, Highlight>();
  try {
    const db = await getDb();
    for (const row of await db.getAllFromIndex("highlights", "byTable", tableId)) byId.set(row.id, fromStored(row));
  } catch {
    /* fall through to memory */
  }
  for (const h of memory.values()) if (h.tableId === tableId) byId.set(h.id, h);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHighlight(id: string): Promise<void> {
  memory.delete(id);
  try {
    const db = await getDb();
    await db.delete("highlights", id);
  } catch {
    /* nothing persisted */
  }
}

/** Highlights are a phone-local convenience, not an archive: prune old ones on startup. */
export async function pruneOldHighlights(): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("highlights", "readwrite");
    let cursor = await tx.store.index("byCreated").openCursor(IDBKeyRange.upperBound(Date.now() - RETENTION_MS));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch {
    /* storage unavailable: nothing to prune */
  }
}
