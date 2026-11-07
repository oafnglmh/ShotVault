import type { Camera, CameraStatus, EzvizCameraConfig, EzvizPublicConfig, RecordingSegment } from "@/core/domain/types";
import { AppError } from "@/core/utils/errors";
import { formatWallTime, toApiDateTime, toEzopenStamp } from "@/core/utils/time";
import type {
  CameraProvider,
  FetchedRecording,
  FetchProgress,
  FetchRequest,
  ProviderCapabilities,
  ViewEvents,
  ViewHandle,
} from "../CameraProvider";
import { EzvizApi } from "./ezvizApi";
import { mountEzuikit } from "./ezuikitPlayer";
import { readFlvStream } from "./flvStreamReader";

const isMobile = () => window.matchMedia("(max-width: 768px)").matches;

/**
 * REAL mode. Uses only the public viewer token from the published config.
 *
 * - Live view & SD/cloud playback: EZUIKit-JS (official), ezopen:// URLs.
 * - Clip export: asks the Open API for an HTTP-FLV playback address for the exact window,
 *   streams it with fetch() and hands the bytes to ffmpeg.wasm for MP4 remux. This path
 *   depends on the EZVIZ stream server sending CORS headers to our origin, which EZVIZ does
 *   not document — it is flagged experimental and must be verified per deployment
 *   (Admin → Trạng thái camera → "Thử tải 10 giây").
 */
export class EzvizCameraProvider implements CameraProvider {
  readonly kind = "ezviz" as const;
  readonly mode = "REAL" as const;
  readonly label = "EZVIZ Open Platform";
  private readonly api: EzvizApi;

  constructor(private readonly cfg: EzvizPublicConfig) {
    this.api = new EzvizApi(cfg.apiDomain);
  }

  private conn(camera: Camera): EzvizCameraConfig {
    if (camera.connection.provider !== "ezviz") throw new AppError("CONFIG", "Camera không phải EZVIZ");
    return camera.connection;
  }

  private token(): string {
    if (!this.cfg.viewerToken) {
      throw new AppError("CAMERA_AUTH", "Quán chưa cấu hình quyền xem camera. Vui lòng báo nhân viên.", "viewerToken empty");
    }
    if (this.cfg.viewerTokenExpiresAt && this.cfg.viewerTokenExpiresAt < Date.now()) {
      throw new AppError("CAMERA_AUTH", "Quyền xem camera đã hết hạn. Vui lòng báo nhân viên quán.", "viewerToken expired");
    }
    return this.cfg.viewerToken;
  }

  capabilities(): ProviderCapabilities {
    return { liveView: true, playbackView: true, listRecordings: true, clipExport: true, experimental: true };
  }

  configurationProblems(camera: Camera): string[] {
    const problems: string[] = [];
    const c = camera.connection;
    if (c.provider !== "ezviz") return ["Không phải camera EZVIZ"];
    if (!/^[A-Z0-9]{6,16}$/.test(c.deviceSerial)) problems.push("Serial thiết bị trống hoặc sai định dạng");
    if (!this.cfg.viewerToken) problems.push("Chưa có viewer token (Cấu hình EZVIZ)");
    else if (this.cfg.viewerTokenExpiresAt && this.cfg.viewerTokenExpiresAt < Date.now()) problems.push("Viewer token đã hết hạn");
    if (!/^https:\/\//.test(this.cfg.apiDomain)) problems.push("API domain phải là https://");
    return problems;
  }

  async checkStatus(camera: Camera, signal?: AbortSignal): Promise<CameraStatus> {
    const problems = this.configurationProblems(camera);
    if (problems.length) return { health: "misconfigured", message: problems.join("; "), checkedAt: Date.now() };
    try {
      const info = await this.api.deviceInfo(this.token(), this.conn(camera).deviceSerial, signal);
      const online = info.status === 1;
      return {
        health: online ? "online" : "offline",
        message: online
          ? `Đang hoạt động${info.isEncrypt ? " — CẢNH BÁO: đang bật mã hoá video" : ""}`
          : "Camera mất kết nối",
        checkedAt: Date.now(),
      };
    } catch (e) {
      if (signal?.aborted) throw e;
      const err = e instanceof AppError ? e : null;
      return {
        health: err?.code === "CAMERA_OFFLINE" ? "offline" : "unknown",
        message: err ? `${err.message}${err.detail ? ` (${err.detail})` : ""}` : String(e),
        checkedAt: Date.now(),
      };
    }
  }

  private ezopenUrl(camera: Camera, suffix: string): string {
    const c = this.conn(camera);
    return `ezopen://${this.cfg.ezopenHost}/${c.deviceSerial}/${c.channelNo}${suffix}`;
  }

  mountLiveView(container: HTMLElement, camera: Camera, events?: ViewEvents): Promise<ViewHandle> {
    return mountEzuikit(
      container,
      {
        url: this.ezopenUrl(camera, ".hd.live"),
        accessToken: this.token(),
        domain: this.cfg.apiDomain,
        template: isMobile() ? "mobileLive" : "pcLive",
      },
      events,
    );
  }

  mountPlaybackView(
    container: HTMLElement,
    camera: Camera,
    range: { startMs: number; endMs: number },
    events?: ViewEvents,
  ): Promise<ViewHandle> {
    const kind = this.cfg.recordingType === 3 ? ".cloud.rec" : ".rec";
    return mountEzuikit(
      container,
      {
        url: `${this.ezopenUrl(camera, kind)}?begin=${toEzopenStamp(range.startMs)}&end=${toEzopenStamp(range.endMs)}`,
        accessToken: this.token(),
        domain: this.cfg.apiDomain,
        template: isMobile() ? "mobileRec" : "pcRec",
      },
      events,
    );
  }

  async listRecordings(camera: Camera, fromMs: number, toMs: number, signal?: AbortSignal): Promise<RecordingSegment[]> {
    const c = this.conn(camera);
    const recType = this.cfg.recordingType === 3 ? 1 : 2;
    const rows = await this.api.videoByTime(this.token(), c.deviceSerial, c.channelNo, fromMs, toMs, recType, signal);
    return (rows ?? [])
      .filter((r) => Number.isFinite(r.startTime) && Number.isFinite(r.endTime) && r.endTime > r.startTime)
      .map((r) => ({
        startTime: r.startTime,
        endTime: r.endTime,
        source: recType === 1 ? ("cloud" as const) : ("sdcard" as const),
      }))
      .sort((a, b) => b.startTime - a.startTime);
  }

  async fetchRecording(
    camera: Camera,
    request: FetchRequest,
    onProgress: (p: FetchProgress) => void,
    signal?: AbortSignal,
  ): Promise<FetchedRecording> {
    const c = this.conn(camera);
    const durationMs = request.endMs - request.startMs;
    if (durationMs <= 0) throw new AppError("PROCESSING_FAILED", "Khoảng thời gian không hợp lệ.");

    onProgress({ phase: "requesting", ratio: null, bytes: 0 });
    const address = await this.api.playAddress(
      {
        accessToken: this.token(),
        deviceSerial: c.deviceSerial,
        channelNo: c.channelNo,
        protocol: 4,
        type: this.cfg.recordingType,
        quality: 1,
        startTime: toApiDateTime(request.startMs),
        stopTime: toApiDateTime(request.endMs),
        expireTime: 600,
      },
      signal,
    );
    if (!address?.url) throw new AppError("CAMERA_UNSUPPORTED", "EZVIZ không trả về địa chỉ phát lại.");

    let res: Response;
    try {
      res = await fetch(address.url, { signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new AppError(
        "CORS_BLOCKED",
        "Máy chủ video EZVIZ không cho phép trình duyệt tải trực tiếp đoạn ghi hình này.",
        `FLV fetch blocked: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok || !res.body) throw new AppError("NETWORK", `Máy chủ video trả về HTTP ${res.status}`);

    // ~4 Mbps main stream ≈ 0.5 MB/s; allow 3x headroom, hard cap 400 MB.
    const maxBytes = Math.min(400 * 1024 * 1024, Math.max(30 * 1024 * 1024, (durationMs / 1000) * 1.5 * 1024 * 1024));
    const result = await readFlvStream(res.body, {
      durationMs,
      maxBytes,
      stallTimeoutMs: 20_000,
      signal,
      onProgress: (mediaMs, bytes) =>
        onProgress({ phase: "downloading", ratio: Math.min(1, mediaMs / durationMs), bytes }),
    });
    if (result.bytes === 0) throw new AppError("CAMERA_UNSUPPORTED", "Không nhận được dữ liệu video từ camera.");
    onProgress({ phase: "done", ratio: 1, bytes: result.bytes });

    return {
      blob: new Blob(result.chunks as BlobPart[], { type: "video/x-flv" }),
      container: "flv",
      fileName: `${c.deviceSerial}_${toEzopenStamp(request.startMs)}.flv`,
      label: `Ghi hình ${formatWallTime(request.startMs)} – ${formatWallTime(request.startMs + result.mediaMs)}`,
      startedAtMs: request.startMs,
      partial: !result.complete && result.mediaMs < durationMs * 0.9,
    };
  }
}
