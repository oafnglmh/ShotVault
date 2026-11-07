import { fromStored, getDb, toStored, type DemoClip } from "@/core/storage/db";
import { newId } from "@/core/utils/ids";
import { ffmpegService } from "@/features/processing/ffmpegService";
import { BilliardsSim } from "./billiardsSim";

/**
 * DEMO footage lives in this device's IndexedDB. It is generated on-device from the
 * simulation (no bundled sample video), so the whole cut → MP4 → download pipeline can be
 * exercised end-to-end without a camera — and it is always labelled DEMO.
 * Mirrored in memory so the demo still works when IndexedDB is unavailable.
 */
const memory = new Map<string, DemoClip>();

export async function listDemoClips(): Promise<DemoClip[]> {
  const byId = new Map(memory);
  try {
    const db = await getDb();
    for (const row of await db.getAll("demoClips")) if (!byId.has(row.id)) byId.set(row.id, fromStored(row));
  } catch {
    /* memory only */
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDemoClip(id: string): Promise<DemoClip | undefined> {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const db = await getDb();
    const row = await db.get("demoClips", id);
    return row ? fromStored(row) : undefined;
  } catch {
    return undefined;
  }
}

export async function deleteDemoClip(id: string): Promise<void> {
  memory.delete(id);
  try {
    const db = await getDb();
    await db.delete("demoClips", id);
  } catch {
    /* nothing persisted */
  }
}

export interface GenerateOptions {
  seconds?: number;
  fps?: number;
  width?: number;
  height?: number;
  onProgress?(phase: "render" | "encode", ratio: number): void;
  signal?: AbortSignal;
}

export async function generateDemoClip(opts: GenerateOptions = {}): Promise<DemoClip> {
  const seconds = opts.seconds ?? 40;
  const fps = opts.fps ?? 15;
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D không khả dụng");

  const sim = new BilliardsSim(Math.floor(Math.random() * 1e6));
  const startedAt = Date.now() - seconds * 1000;
  const frames: Uint8Array[] = [];
  const total = seconds * fps;
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    sim.step(1 / fps);
    const stamp = new Date(startedAt + (i / fps) * 1000).toLocaleTimeString("vi-VN");
    sim.draw(ctx, width, height, stamp);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) throw new Error("Không render được khung hình");
    frames.push(new Uint8Array(await blob.arrayBuffer()));
    if (i % fps === 0) opts.onProgress?.("render", i / total);
  }
  const video = await ffmpegService.encodeJpegSequence(frames, fps, {
    signal: opts.signal,
    onProgress: (r) => opts.onProgress?.("encode", r),
  });
  const clip: DemoClip = {
    id: newId("demo_"),
    name: `Video mẫu ${new Date().toLocaleTimeString("vi-VN")}`,
    createdAt: Date.now(),
    durationSec: seconds,
    blob: video,
  };
  memory.set(clip.id, clip);
  try {
    const db = await getDb();
    await db.put("demoClips", await toStored(clip));
  } catch {
    /* kept in memory for this session */
  }
  return clip;
}
