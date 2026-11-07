import type { VenueConfig } from "../domain/types";
import { getDb } from "../storage/db";
import { readPref, writePref } from "../storage/localPrefs";
import { DEFAULT_VENUE } from "./defaultVenue";
import { parseVenueConfig } from "./venueSchema";

/**
 * Where the venue configuration comes from, in a frontend-only world:
 *
 *  - "published": /config/venue.json deployed with the static site. This is what every
 *    customer phone sees. The admin edits a draft, exports it, and redeploys.
 *  - "draft": the admin's working copy in this browser's IndexedDB. Only visible on this
 *    device, and only when "preview draft" is switched on.
 *  - "builtin": fallback when the published file is missing/broken.
 */
export type ConfigSource = "published" | "draft" | "builtin";

export interface LoadedConfig {
  config: VenueConfig;
  source: ConfigSource;
  publishedError?: string;
}

const DRAFT_KEY = "current";
const PREVIEW_PREF = "previewDraft";

export async function loadPublishedConfig(): Promise<VenueConfig> {
  const res = await fetch(`/config/venue.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Không tải được /config/venue.json (HTTP ${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error("/config/venue.json không phải JSON (kiểm tra cấu hình rewrite của hosting)");
  return parseVenueConfig(await res.json());
}

export async function loadDraft(): Promise<VenueConfig | null> {
  try {
    const db = await getDb();
    const raw = await db.get("drafts", DRAFT_KEY);
    return raw ? parseVenueConfig(raw) : null;
  } catch {
    return null;
  }
}

export async function saveDraft(config: VenueConfig): Promise<VenueConfig> {
  const next = parseVenueConfig({ ...config, updatedAt: Date.now() });
  const db = await getDb();
  await db.put("drafts", next, DRAFT_KEY);
  return next;
}

export async function clearDraft(): Promise<void> {
  const db = await getDb();
  await db.delete("drafts", DRAFT_KEY);
}

export const isDraftPreviewEnabled = () => readPref(PREVIEW_PREF) === "1";
export const setDraftPreviewEnabled = (on: boolean) => writePref(PREVIEW_PREF, on ? "1" : null);

export async function loadEffectiveConfig(): Promise<LoadedConfig> {
  let published: VenueConfig | null = null;
  let publishedError: string | undefined;
  try {
    published = await loadPublishedConfig();
  } catch (e) {
    publishedError = e instanceof Error ? e.message : String(e);
  }
  if (isDraftPreviewEnabled()) {
    const draft = await loadDraft();
    if (draft) return { config: draft, source: "draft", publishedError };
  }
  if (published) return { config: published, source: "published" };
  return { config: DEFAULT_VENUE, source: "builtin", publishedError };
}

/** Admin starting point: existing draft, else the published config, else the default. */
export async function loadAdminWorkingCopy(): Promise<VenueConfig> {
  const draft = await loadDraft();
  if (draft) return draft;
  try {
    return await loadPublishedConfig();
  } catch {
    return structuredClone(DEFAULT_VENUE);
  }
}

export function exportConfigJson(config: VenueConfig): string {
  return JSON.stringify({ ...config, updatedAt: Date.now() }, null, 2);
}
