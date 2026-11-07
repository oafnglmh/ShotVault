import type { Camera, CameraStatus, ProviderKind, RecordingSegment, RunMode } from "@/core/domain/types";

/**
 * Vendor-neutral camera contract. UI code only ever talks to this interface,
 * so another brand (Imou, Hik-Connect, a generic HLS URL, …) is a new class, not a UI rewrite.
 */
export interface ProviderCapabilities {
  liveView: boolean;
  /** Watch SD-card / cloud recordings inside the vendor player (no file). */
  playbackView: boolean;
  /** List recording segments for a time window. */
  listRecordings: boolean;
  /** Retrieve recorded video as bytes in the browser so it can be cut into an MP4. */
  clipExport: boolean;
  /** True when a capability is implemented against vendor docs but not yet proven on real hardware. */
  experimental: boolean;
}

export interface ViewHandle {
  destroy(): void;
}

export interface ViewEvents {
  onReady?(): void;
  onError?(message: string): void;
}

export interface FetchProgress {
  phase: "requesting" | "downloading" | "done";
  /** 0..1 when known */
  ratio: number | null;
  bytes: number;
}

export interface FetchedRecording {
  blob: Blob;
  /** File extension that tells ffmpeg the container, e.g. "mp4", "flv". */
  container: string;
  fileName: string;
  label: string;
  /** Wall-clock time of the first frame, if known. */
  startedAtMs?: number;
  /** True when the stream ended before the requested window was complete. */
  partial: boolean;
}

export interface FetchRequest {
  startMs: number;
  endMs: number;
  segment?: RecordingSegment;
}

export interface CameraProvider {
  readonly kind: ProviderKind;
  readonly mode: RunMode;
  readonly label: string;
  capabilities(camera: Camera): ProviderCapabilities;
  /** Human-readable reasons a capability is unavailable, for admin diagnostics. */
  configurationProblems(camera: Camera): string[];
  checkStatus(camera: Camera, signal?: AbortSignal): Promise<CameraStatus>;
  mountLiveView(container: HTMLElement, camera: Camera, events?: ViewEvents): Promise<ViewHandle>;
  mountPlaybackView(
    container: HTMLElement,
    camera: Camera,
    range: { startMs: number; endMs: number },
    events?: ViewEvents,
  ): Promise<ViewHandle>;
  listRecordings(camera: Camera, fromMs: number, toMs: number, signal?: AbortSignal): Promise<RecordingSegment[]>;
  fetchRecording(
    camera: Camera,
    request: FetchRequest,
    onProgress: (p: FetchProgress) => void,
    signal?: AbortSignal,
  ): Promise<FetchedRecording>;
}
