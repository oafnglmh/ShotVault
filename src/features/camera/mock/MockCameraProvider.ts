import type { Camera, CameraStatus, RecordingSegment } from "@/core/domain/types";
import { AppError } from "@/core/utils/errors";
import type {
  CameraProvider,
  FetchedRecording,
  FetchProgress,
  FetchRequest,
  ProviderCapabilities,
  ViewEvents,
  ViewHandle,
} from "../CameraProvider";
import { BilliardsSim } from "./billiardsSim";
import { getDemoClip, listDemoClips } from "./demoClips";

/**
 * DEMO mode provider. Never claims to be a camera: status is always "demo", the live view is a
 * labelled simulation, and "recordings" are demo clips generated on this device or a static
 * demo file the admin deployed.
 */
export class MockCameraProvider implements CameraProvider {
  readonly kind = "mock" as const;
  readonly mode = "DEMO" as const;
  readonly label = "Camera mô phỏng (DEMO)";

  capabilities(): ProviderCapabilities {
    return { liveView: true, playbackView: false, listRecordings: true, clipExport: true, experimental: false };
  }

  configurationProblems(): string[] {
    return [];
  }

  async checkStatus(): Promise<CameraStatus> {
    return { health: "demo", message: "Chế độ DEMO — không kết nối camera thật", checkedAt: Date.now() };
  }

  async mountLiveView(container: HTMLElement, _camera: Camera, events?: ViewEvents): Promise<ViewHandle> {
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    container.innerHTML = "";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new AppError("BROWSER_UNSUPPORTED", "Canvas không khả dụng");
    const sim = new BilliardsSim();
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    const loop = (now: number) => {
      sim.step(Math.min(0.05, (now - last) / 1000));
      last = now;
      sim.draw(ctx, canvas.width, canvas.height, new Date().toLocaleTimeString("vi-VN"));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    events?.onReady?.();
    return {
      destroy() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        container.innerHTML = "";
      },
    };
  }

  async mountPlaybackView(): Promise<ViewHandle> {
    throw new AppError("CAMERA_UNSUPPORTED", "Camera mô phỏng không có thẻ nhớ để xem lại.");
  }

  async listRecordings(camera: Camera): Promise<RecordingSegment[]> {
    const clips = await listDemoClips();
    const segments: RecordingSegment[] = clips.map((c) => ({
      startTime: c.createdAt - c.durationSec * 1000,
      endTime: c.createdAt,
      source: "demo",
      label: c.name,
      demoClipId: c.id,
    }));
    if (camera.connection.provider === "mock" && camera.connection.demoClipUrl) {
      segments.push({ startTime: 0, endTime: 0, source: "demo", label: "Video mẫu của quán", demoClipId: "url" });
    }
    return segments;
  }

  async fetchRecording(
    camera: Camera,
    request: FetchRequest,
    onProgress: (p: FetchProgress) => void,
    signal?: AbortSignal,
  ): Promise<FetchedRecording> {
    const id = request.segment?.demoClipId;
    if (!id) throw new AppError("NOT_FOUND", "Chưa có video mẫu. Hãy tạo video mẫu trước.");
    if (id === "url" && camera.connection.provider === "mock" && camera.connection.demoClipUrl) {
      onProgress({ phase: "requesting", ratio: null, bytes: 0 });
      const res = await fetch(camera.connection.demoClipUrl, { signal });
      if (!res.ok) throw new AppError("NOT_FOUND", `Không tải được video mẫu (HTTP ${res.status})`);
      const blob = await res.blob();
      onProgress({ phase: "done", ratio: 1, bytes: blob.size });
      const ext = camera.connection.demoClipUrl.split(".").pop()?.toLowerCase() ?? "mp4";
      return { blob, container: ext, fileName: `demo.${ext}`, label: "Video mẫu của quán (DEMO)", partial: false };
    }
    const clip = await getDemoClip(id);
    if (!clip) throw new AppError("NOT_FOUND", "Video mẫu không còn trên máy này.");
    onProgress({ phase: "done", ratio: 1, bytes: clip.blob.size });
    return { blob: clip.blob, container: "mp4", fileName: `${clip.id}.mp4`, label: `${clip.name} (DEMO)`, partial: false };
  }
}
