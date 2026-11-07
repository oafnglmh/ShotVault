import { useSyncExternalStore } from "react";
import type { RunMode } from "@/core/domain/types";

/**
 * The video the customer picked to cut from. Kept in memory only (it can be a large
 * File/Blob); a page refresh sends the customer back to "Chọn video".
 */
export interface VideoSource {
  tableId: string;
  blob: Blob;
  /** Name with extension so ffmpeg can detect the container. */
  fileName: string;
  label: string;
  origin: "local-file" | "demo" | "camera";
  mode: RunMode;
  /** Wall-clock time of the first frame when known (camera recordings). */
  startedAtMs?: number;
  partial?: boolean;
}

let current: VideoSource | null = null;
let objectUrl: string | null = null;
const listeners = new Set<() => void>();

export function setVideoSource(src: VideoSource | null) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  current = src;
  listeners.forEach((l) => l());
}

export function getVideoSource(): VideoSource | null {
  return current;
}

/** One stable object URL per source, revoked when the source changes. */
export function getVideoSourceUrl(): string | null {
  if (!current) return null;
  if (!objectUrl) objectUrl = URL.createObjectURL(current.blob);
  return objectUrl;
}

export function useVideoSource(tableId: string): VideoSource | null {
  const src = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return src && src.tableId === tableId ? src : null;
}
