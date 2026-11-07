import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { AppError, isAbort, toAppError } from "@/core/utils/errors";
import { parseProbeLog, type ProbeInfo } from "./probe";

/**
 * Single-thread ffmpeg.wasm (no SharedArrayBuffer → no COOP/COEP headers needed, works on
 * iOS Safari and any static host). Inputs are mounted with WORKERFS, so the source video is
 * read lazily from the Blob/File instead of being copied into wasm memory; only the output
 * clip lives in MEMFS.
 */

export type LoadState = { phase: "idle" | "downloading" | "initializing" | "ready"; ratio: number | null };

export interface JobOptions {
  onProgress?(ratio: number): void;
  signal?: AbortSignal;
}

type Job<T> = (ff: FFmpeg) => Promise<T>;

class FFmpegService {
  private ff: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private logs: string[] = [];
  private loadListeners = new Set<(s: LoadState) => void>();
  state: LoadState = { phase: "idle", ratio: null };

  onLoadState(cb: (s: LoadState) => void): () => void {
    this.loadListeners.add(cb);
    cb(this.state);
    return () => this.loadListeners.delete(cb);
  }

  private setState(s: LoadState) {
    this.state = s;
    this.loadListeners.forEach((cb) => cb(s));
  }

  get isReady() {
    return this.state.phase === "ready";
  }

  load(): Promise<FFmpeg> {
    if (this.ff && this.isReady) return Promise.resolve(this.ff);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (typeof WebAssembly !== "object") {
        throw new AppError("BROWSER_UNSUPPORTED", "Trình duyệt không hỗ trợ WebAssembly. Hãy cập nhật Chrome/Safari.");
      }
      const ff = new FFmpeg();
      ff.on("log", ({ message }) => {
        this.logs.push(message);
        if (this.logs.length > 400) this.logs.splice(0, this.logs.length - 400);
      });
      this.setState({ phase: "downloading", ratio: 0 });
      // Core JS is small; the ~30 MB wasm is fetched with progress (HTTP-cached after first time).
      const wasmBlobUrl = await toBlobURL(wasmURL, "application/wasm", true, (ev: { total: number; received: number }) => {
        if (ev.total > 0) this.setState({ phase: "downloading", ratio: Math.min(1, ev.received / ev.total) });
      });
      this.setState({ phase: "initializing", ratio: null });
      await ff.load({ coreURL: new URL(coreURL, location.href).href, wasmURL: wasmBlobUrl });
      this.ff = ff;
      this.setState({ phase: "ready", ratio: 1 });
      return ff;
    })().catch((e) => {
      this.loading = null;
      this.ff = null;
      this.setState({ phase: "idle", ratio: null });
      throw e instanceof AppError
        ? e
        : new AppError("BROWSER_UNSUPPORTED", "Không khởi động được bộ xử lý video trên trình duyệt này.", String(e));
    });
    return this.loading;
  }

  /** Kill the worker (frees all wasm memory). Next job reloads it. */
  reset() {
    try {
      this.ff?.terminate();
    } catch {
      /* already gone */
    }
    this.ff = null;
    this.loading = null;
    this.setState({ phase: "idle", ratio: null });
  }

  /** Jobs run one at a time — ffmpeg.wasm has a single FS and a single exec slot. */
  private enqueue<T>(job: Job<T>, signal?: AbortSignal): Promise<T> {
    const run = async () => {
      if (signal?.aborted) throw new AppError("ABORTED", "Đã huỷ.");
      const ff = await this.load();
      this.logs = [];
      const onAbort = () => this.reset();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        return await job(ff);
      } catch (e) {
        if (signal?.aborted || isAbort(e)) throw new AppError("ABORTED", "Đã huỷ.");
        const err = toAppError(e);
        // A crashed/oom'd wasm instance is unusable afterwards.
        if (err.code === "OUT_OF_MEMORY" || /abort|unreachable|terminate/i.test(String(e))) this.reset();
        throw err;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  recentLog(lines = 12): string {
    return this.logs.slice(-lines).join("\n");
  }

  private async withMountedInput<T>(ff: FFmpeg, blob: Blob, name: string, fn: (path: string) => Promise<T>): Promise<T> {
    const dir = `/in_${Math.random().toString(36).slice(2, 8)}`;
    await ff.createDir(dir);
    await ff.mount(FFFSType.WORKERFS, { blobs: [{ name, data: blob }] }, dir);
    try {
      return await fn(`${dir}/${name}`);
    } finally {
      await ff.unmount(dir).catch(() => undefined);
      await ff.deleteDir(dir).catch(() => undefined);
    }
  }

  private async exec(ff: FFmpeg, args: string[], durationSec: number | null, opts: JobOptions): Promise<void> {
    const onProg = ({ time }: { progress: number; time: number }) => {
      if (durationSec && durationSec > 0 && time > 0) opts.onProgress?.(Math.min(1, time / 1_000_000 / durationSec));
    };
    ff.on("progress", onProg);
    try {
      const code = await ff.exec(args, -1, { signal: opts.signal });
      if (code !== 0) {
        throw new AppError("PROCESSING_FAILED", "Không xử lý được video.", `ffmpeg exit ${code}\n${this.recentLog()}`);
      }
    } finally {
      ff.off("progress", onProg);
    }
  }

  private async takeOutput(ff: FFmpeg, path: string, mime: string): Promise<Blob> {
    const data = await ff.readFile(path);
    await ff.deleteFile(path).catch(() => undefined);
    if (typeof data === "string" || data.byteLength < 1024) {
      throw new AppError("PROCESSING_FAILED", "Video xuất ra bị rỗng.", this.recentLog());
    }
    return new Blob([data as BlobPart], { type: mime });
  }

  probe(blob: Blob, name: string, signal?: AbortSignal): Promise<ProbeInfo> {
    return this.enqueue(
      (ff) =>
        this.withMountedInput(ff, blob, name, async (path) => {
          // No output → ffmpeg exits non-zero after printing stream info, which is all we need.
          await ff.exec(["-hide_banner", "-i", path], -1, { signal }).catch(() => undefined);
          return parseProbeLog(this.logs.join("\n"));
        }),
      signal,
    );
  }

  /**
   * Stream-copy a container into MP4 (e.g. EZVIZ HTTP-FLV → MP4). Audio that MP4 can't carry
   * (G.711 a-law/µ-law from cameras) is transcoded to AAC, which is cheap.
   */
  remuxToMp4(blob: Blob, name: string, opts: JobOptions & { probe?: ProbeInfo } = {}): Promise<Blob> {
    return this.enqueue(
      (ff) =>
        this.withMountedInput(ff, blob, name, async (path) => {
          const info = opts.probe ?? parseProbeLog("");
          const out = `remux_${Date.now()}.mp4`;
          const attempts: string[][] = [
            ["-c:v", "copy", ...audioArgs(info), ...hevcTag(info)],
            ["-c:v", "copy", "-an", ...hevcTag(info)],
          ];
          let lastErr: unknown;
          for (const codecArgs of attempts) {
            try {
              await this.exec(
                ff,
                ["-hide_banner", "-fflags", "+genpts", "-i", path, "-map", "0:v:0", "-map", "0:a:0?", ...codecArgs, "-movflags", "+faststart", out],
                info.durationSec,
                opts,
              );
              return await this.takeOutput(ff, out, "video/mp4");
            } catch (e) {
              if (opts.signal?.aborted) throw e;
              lastErr = e;
              await ff.deleteFile(out).catch(() => undefined);
            }
          }
          throw lastErr;
        }),
      opts.signal,
    );
  }

  /**
   * Cut [start, end] seconds.
   *  - fast: stream copy, starts at the keyframe at/before `start` (instant, no quality loss).
   *  - precise: re-encode to H.264/AAC, frame-accurate, CPU-heavy.
   */
  trim(
    blob: Blob,
    name: string,
    range: { start: number; end: number },
    mode: "fast" | "precise",
    opts: JobOptions & { probe?: ProbeInfo; maxHeight?: number } = {},
  ): Promise<Blob> {
    const duration = Math.max(0.1, range.end - range.start);
    return this.enqueue(
      (ff) =>
        this.withMountedInput(ff, blob, name, async (path) => {
          const info = opts.probe ?? parseProbeLog("");
          const out = `clip_${Date.now()}.mp4`;
          const head = ["-hide_banner", "-ss", range.start.toFixed(3), "-i", path, "-t", duration.toFixed(3), "-map", "0:v:0", "-map", "0:a:0?"];
          const codec =
            mode === "fast"
              ? ["-c:v", "copy", ...audioArgs(info), ...hevcTag(info), "-avoid_negative_ts", "make_zero"]
              : [
                  "-vf",
                  `scale=-2:'min(${opts.maxHeight ?? 1080},ih)'`,
                  "-c:v",
                  "libx264",
                  "-preset",
                  "ultrafast",
                  "-crf",
                  "23",
                  "-pix_fmt",
                  "yuv420p",
                  "-c:a",
                  "aac",
                  "-b:a",
                  "128k",
                ];
          await this.exec(ff, [...head, ...codec, "-movflags", "+faststart", out], duration, opts);
          return this.takeOutput(ff, out, "video/mp4");
        }),
      opts.signal,
    );
  }

  /** Encode a numbered JPEG sequence into an H.264 MP4 (used to build DEMO footage on-device). */
  encodeJpegSequence(frames: Uint8Array[], fps: number, opts: JobOptions = {}): Promise<Blob> {
    return this.enqueue(async (ff) => {
      const dir = `/frames_${Date.now()}`;
      await ff.createDir(dir);
      try {
        for (let i = 0; i < frames.length; i++) {
          await ff.writeFile(`${dir}/f${String(i).padStart(5, "0")}.jpg`, frames[i]);
        }
        const out = `demo_${Date.now()}.mp4`;
        await this.exec(
          ff,
          ["-hide_banner", "-framerate", String(fps), "-i", `${dir}/f%05d.jpg`, "-c:v", "libx264", "-preset", "ultrafast", "-g", String(fps), "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
          frames.length / fps,
          opts,
        );
        return await this.takeOutput(ff, out, "video/mp4");
      } finally {
        for (let i = 0; i < frames.length; i++) await ff.deleteFile(`${dir}/f${String(i).padStart(5, "0")}.jpg`).catch(() => undefined);
        await ff.deleteDir(dir).catch(() => undefined);
      }
    }, opts.signal);
  }
}

function audioArgs(info: ProbeInfo): string[] {
  if (!info.audioCodec) return [];
  return ["aac", "mp3"].includes(info.audioCodec) ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "96k"];
}

/** Apple players require the hvc1 sample entry for HEVC in MP4. */
function hevcTag(info: ProbeInfo): string[] {
  return info.videoCodec === "hevc" ? ["-tag:v", "hvc1"] : [];
}

export const ffmpegService = new FFmpegService();
