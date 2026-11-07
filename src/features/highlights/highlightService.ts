import type { BilliardTable, Camera, ClipLimits, Highlight, TimeRange } from "@/core/domain/types";
import { processingBudget } from "@/core/utils/device";
import { AppError } from "@/core/utils/errors";
import { newId, safeFileName } from "@/core/utils/ids";
import type { CameraProvider, FetchProgress, FetchRequest } from "@/features/camera/CameraProvider";
import { planCut, type CutMode } from "@/features/processing/cutPlanner";
import { ffmpegService } from "@/features/processing/ffmpegService";
import type { ProbeInfo } from "@/features/processing/probe";
import { saveHighlight } from "./highlightRepository";
import type { VideoSource } from "./sourceStore";

/** Application-level use cases that glue camera, processing and storage together. */

export type PrepareProgress =
  | { phase: "fetch"; detail: FetchProgress }
  | { phase: "convert"; ratio: number | null };

/** Camera recording → a VideoSource the browser can play (HTTP-FLV is remuxed to MP4). */
export async function prepareCameraRecording(args: {
  provider: CameraProvider;
  camera: Camera;
  table: BilliardTable;
  request: FetchRequest;
  limits: ClipLimits;
  onProgress(p: PrepareProgress): void;
  signal?: AbortSignal;
}): Promise<VideoSource> {
  const span = (args.request.endMs - args.request.startMs) / 1000;
  if (args.request.segment?.source !== "demo" && span > args.limits.maxFetchSeconds) {
    throw new AppError("TOO_LARGE", `Mỗi lần chỉ lấy tối đa ${Math.round(args.limits.maxFetchSeconds / 60)} phút ghi hình.`);
  }
  const fetched = await args.provider.fetchRecording(
    args.camera,
    args.request,
    (detail) => args.onProgress({ phase: "fetch", detail }),
    args.signal,
  );
  let blob = fetched.blob;
  let fileName = fetched.fileName;
  if (fetched.container !== "mp4" && fetched.container !== "mov") {
    args.onProgress({ phase: "convert", ratio: null });
    const probe = await ffmpegService.probe(blob, fileName, args.signal);
    if (!probe.videoCodec) {
      throw new AppError("CODEC_UNSUPPORTED", "Dữ liệu nhận được từ camera không chứa video đọc được.", ffmpegService.recentLog());
    }
    blob = await ffmpegService.remuxToMp4(blob, fileName, {
      probe,
      signal: args.signal,
      onProgress: (ratio) => args.onProgress({ phase: "convert", ratio }),
    });
    fileName = fileName.replace(/\.[^.]+$/, "") + ".mp4";
  }
  return {
    tableId: args.table.id,
    blob,
    fileName,
    label: fetched.label,
    origin: args.provider.mode === "DEMO" ? "demo" : "camera",
    mode: args.provider.mode,
    startedAtMs: fetched.startedAtMs,
    partial: fetched.partial,
  };
}

const probeCache = new WeakMap<Blob, ProbeInfo>();

export async function probeSource(source: VideoSource, signal?: AbortSignal): Promise<ProbeInfo> {
  const hit = probeCache.get(source.blob);
  if (hit) return hit;
  const info = await ffmpegService.probe(source.blob, source.fileName, signal);
  probeCache.set(source.blob, info);
  return info;
}

export function planForSource(source: VideoSource, range: TimeRange, requested: CutMode, limits: ClipLimits, probe: ProbeInfo | null) {
  const budget = processingBudget();
  return planCut({
    clipSeconds: range.end - range.start,
    requested,
    limits,
    probe,
    lowMemory: budget.lowMemory,
    inputBytes: source.blob.size,
    maxInputMb: budget.maxInputMb,
  });
}

export async function exportHighlight(args: {
  source: VideoSource;
  range: TimeRange;
  mode: CutMode;
  limits: ClipLimits;
  table: BilliardTable;
  camera: Camera | null;
  onPhase(phase: "loading-engine" | "analyzing" | "cutting" | "saving"): void;
  onProgress(ratio: number): void;
  signal?: AbortSignal;
}): Promise<Highlight> {
  if (!ffmpegService.isReady) args.onPhase("loading-engine");
  await ffmpegService.load();
  args.onPhase("analyzing");
  const probe = await probeSource(args.source, args.signal);
  const plan = planForSource(args.source, args.range, args.mode, args.limits, probe);
  if (!plan.ok) throw new AppError("TOO_LARGE", plan.reason ?? "Không thể cắt đoạn này.");

  args.onPhase("cutting");
  let blob: Blob;
  try {
    blob = await ffmpegService.trim(args.source.blob, args.source.fileName, args.range, plan.mode, {
      probe,
      maxHeight: plan.maxHeight,
      signal: args.signal,
      onProgress: args.onProgress,
    });
  } catch (e) {
    // Stream copy can fail on odd inputs (broken timestamps, exotic audio); retry with re-encode if short enough.
    if (plan.mode === "fast" && !(e instanceof AppError && (e.code === "ABORTED" || e.code === "OUT_OF_MEMORY"))) {
      const retry = planForSource(args.source, args.range, "precise", args.limits, probe);
      if (!retry.ok) throw e;
      blob = await ffmpegService.trim(args.source.blob, args.source.fileName, args.range, "precise", {
        probe,
        maxHeight: retry.maxHeight,
        signal: args.signal,
        onProgress: args.onProgress,
      });
    } else throw e;
  }

  args.onPhase("saving");
  const createdAt = Date.now();
  const stamp = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const highlight: Highlight = {
    id: newId("hl_"),
    tableId: args.table.id,
    cameraId: args.camera?.id ?? null,
    createdAt,
    durationSec: Math.round((args.range.end - args.range.start) * 10) / 10,
    sizeBytes: blob.size,
    mimeType: "video/mp4",
    fileName: `${safeFileName(args.table.name)}_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.mp4`,
    sourceLabel: args.source.label,
    mode: args.source.mode,
    blob,
  };
  await saveHighlight(highlight);
  return highlight;
}
