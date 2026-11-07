import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { RecordingSegment } from "@/core/domain/types";
import { AppError, isAbort, toAppError } from "@/core/utils/errors";
import { formatBytes, formatWallTime } from "@/core/utils/time";
import { CameraView } from "@/features/camera/components/CameraView";
import { generateDemoClip } from "@/features/camera/mock/demoClips";
import { prepareCameraRecording, type PrepareProgress } from "@/features/highlights/highlightService";
import { setVideoSource } from "@/features/highlights/sourceStore";
import { ffmpegService, type LoadState } from "@/features/processing/ffmpegService";
import { IconClock, IconFilm, IconUpload } from "@/ui/icons";
import { Button, Card, ModeBadge, Notice, ProgressBar, Spinner, cx } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";

type Busy = { title: string; detail: string; ratio: number | null } | null;

/** Customer screen 4 — pick the footage to cut. */
export function RecordingsPage() {
  const { table, camera, provider, base, venue } = useTableContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const caps = provider.capabilities(camera);
  const [segments, setSegments] = useState<RecordingSegment[] | null>(null);
  const [segError, setSegError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [openSeg, setOpenSeg] = useState<number | null>(null);
  const [watch, setWatch] = useState<{ startMs: number; endMs: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoStarted = useRef(false);
  const maxFetchMin = Math.floor(venue.limits.maxFetchSeconds / 60);

  const loadSegments = useCallback(async () => {
    if (!caps.listRecordings) return setSegments([]);
    setSegError(null);
    try {
      const now = Date.now();
      setSegments(await provider.listRecordings(camera, now - 3 * 3600_000, now));
    } catch (e) {
      setSegments([]);
      setSegError(toAppError(e).message);
    }
  }, [caps.listRecordings, provider, camera]);

  useEffect(() => {
    void loadSegments();
    return () => abortRef.current?.abort();
  }, [loadSegments]);

  // Track ffmpeg engine download so the customer sees why the first run takes longer.
  const [engine, setEngine] = useState<LoadState>(ffmpegService.state);
  useEffect(() => ffmpegService.onLoadState(setEngine), []);

  const progressText = (p: PrepareProgress): Busy => {
    if (p.phase === "fetch") {
      if (p.detail.phase === "requesting") return { title: "Đang kết nối camera", detail: "Yêu cầu đoạn ghi hình từ thẻ nhớ…", ratio: null };
      return { title: "Đang tải đoạn ghi hình", detail: formatBytes(p.detail.bytes), ratio: p.detail.ratio };
    }
    return { title: "Đang chuyển sang MP4", detail: "Xử lý ngay trên điện thoại của bạn", ratio: p.ratio };
  };

  const run = async (job: (signal: AbortSignal) => Promise<void>) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    try {
      await job(ac.signal);
    } catch (e) {
      if (!isAbort(e) && !ac.signal.aborted) setError(toAppError(e));
    } finally {
      if (abortRef.current === ac) setBusy(null);
    }
  };

  const fetchWindow = (startMs: number, endMs: number, segment?: RecordingSegment) =>
    run(async (signal) => {
      setBusy({ title: "Đang chuẩn bị", detail: "", ratio: null });
      const source = await prepareCameraRecording({
        provider,
        camera,
        table,
        request: { startMs, endMs, segment },
        limits: venue.limits,
        signal,
        onProgress: (p) => setBusy(progressText(p)),
      });
      setVideoSource(source);
      navigate(`${base}/editor`);
    });

  const fetchLast = (minutes: number) => {
    const end = Date.now() - 3000; // the SD card writer lags a little behind real time
    void fetchWindow(end - minutes * 60_000, end);
  };

  useEffect(() => {
    const last = Number(params.get("last"));
    if (!autoStarted.current && last > 0 && provider.mode === "REAL" && caps.clipExport) {
      autoStarted.current = true;
      fetchLast(Math.min(last, maxFetchMin));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createDemo = () =>
    run(async (signal) => {
      setBusy({ title: "Đang tạo video mẫu", detail: "Dựng khung hình mô phỏng…", ratio: 0 });
      await generateDemoClip({
        signal,
        onProgress: (phase, ratio) =>
          setBusy({
            title: "Đang tạo video mẫu",
            detail: phase === "render" ? "Dựng khung hình mô phỏng…" : "Mã hoá H.264 trên thiết bị…",
            ratio: phase === "render" ? ratio * 0.5 : 0.5 + ratio * 0.5,
          }),
      });
      await loadSegments();
    });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|flv|ts)$/i.test(file.name)) {
      setError(new AppError("CODEC_UNSUPPORTED", "File này không phải video."));
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
    setVideoSource({
      tableId: table.id,
      blob: file,
      fileName: `local.${ext}`,
      label: file.name,
      origin: "local-file",
      mode: provider.mode,
    });
    navigate(`${base}/editor`);
  };

  const windowsFor = (s: RecordingSegment) => {
    const step = venue.limits.maxFetchSeconds * 1000;
    const out: Array<[number, number]> = [];
    for (let t = s.endTime; t > s.startTime && out.length < 24; t -= step) out.push([Math.max(s.startTime, t - step), t]);
    return out;
  };

  const isDemo = provider.mode === "DEMO";

  return (
    <CustomerLayout back={base} title={<span className="font-semibold">{table.name} · Chọn video</span>} right={<ModeBadge mode={provider.mode} />}>
      {error && (
        <Notice tone="error" title="Không lấy được video" className="mb-5">
          {error.message}
          {error.code === "CORS_BLOCKED" && " Bạn vẫn có thể xem lại bằng trình phát EZVIZ bên dưới, hoặc cắt video có sẵn trong điện thoại."}
          {error.detail && <span className="mt-1 block break-all text-xs text-faint">{error.detail.slice(0, 240)}</span>}
        </Notice>
      )}

      {!isDemo && caps.clipExport && (
        <section>
          <h2 className="font-display text-2xl">Lấy lại đoạn vừa qua</h2>
          <p className="mt-1 text-sm text-muted">Lấy từ thẻ nhớ camera của {table.name}, sau đó bạn tự chọn điểm cắt.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[1, 2, 5].filter((m) => m <= maxFetchMin).map((m) => (
              <Button key={m} variant="secondary" className="h-16 flex-col !gap-0" onClick={() => fetchLast(m)} disabled={!!busy}>
                <span className="font-display text-2xl leading-none">{m}</span>
                <span className="text-xs font-medium text-muted">phút trước</span>
              </Button>
            ))}
          </div>
          {caps.experimental && (
            <p className="mt-2 text-xs text-faint">Tính năng tải trực tiếp từ camera đang ở giai đoạn thử nghiệm.</p>
          )}
        </section>
      )}

      <section className={cx(!isDemo && caps.clipExport && "mt-9")}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">{isDemo ? "Video mẫu (DEMO)" : "Ghi hình 3 giờ qua"}</h2>
          {segments === null && <Spinner className="h-4 w-4 text-muted" />}
        </div>
        {segError && <Notice tone="warn" className="mt-3">{segError}</Notice>}
        {isDemo && (
          <p className="mt-1 text-sm text-muted">
            Camera mô phỏng không có thẻ nhớ thật. Tạo một video mô phỏng 40 giây ngay trên máy để thử toàn bộ quy trình cắt và tải.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {segments?.map((s, i) => (
            <li key={`${s.startTime}-${i}`}>
              {s.source === "demo" ? (
                <button
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left hover:border-line-strong disabled:opacity-50"
                  onClick={() => void fetchWindow(s.startTime, s.endTime, s)}
                  disabled={!!busy}
                >
                  <IconFilm className="shrink-0 text-brass" />
                  <span className="flex-1 text-sm font-medium">{s.label}</span>
                  <ModeBadge mode="DEMO" />
                </button>
              ) : (
                <Card className="overflow-hidden">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenSeg(openSeg === i ? null : i)}>
                    <IconClock className="shrink-0 text-felt-bright" />
                    <span className="flex-1 text-sm font-medium">
                      {formatWallTime(s.startTime)} – {formatWallTime(s.endTime)}
                    </span>
                    <span className="text-xs text-faint">{s.source === "cloud" ? "Cloud" : "Thẻ nhớ"}</span>
                  </button>
                  {openSeg === i && (
                    <div className="border-t border-line px-4 py-3">
                      <div className="mb-2 text-xs text-muted">Chọn khoảng {maxFetchMin} phút để cắt:</div>
                      <div className="flex flex-wrap gap-2">
                        {windowsFor(s).map(([a, b]) => (
                          <Button key={a} size="sm" onClick={() => void fetchWindow(a, b, s)} disabled={!!busy}>
                            {formatWallTime(a).slice(0, 5)}–{formatWallTime(b).slice(0, 5)}
                          </Button>
                        ))}
                      </div>
                      {caps.playbackView && (
                        <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setWatch({ startMs: s.startTime, endMs: s.endTime })}>
                          Xem lại bằng trình phát EZVIZ
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              )}
            </li>
          ))}
          {segments?.length === 0 && !isDemo && !segError && (
            <li className="rounded-xl border border-line px-4 py-4 text-sm text-muted">Không tìm thấy đoạn ghi hình nào.</li>
          )}
        </ul>
        {isDemo && (
          <Button variant="primary" size="lg" className="mt-3" onClick={() => void createDemo()} disabled={!!busy}>
            Tạo video mẫu 40 giây
          </Button>
        )}
      </section>

      {watch && (
        <section className="mt-6">
          <CameraView provider={provider} camera={camera} playback={watch} />
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setWatch(null)}>
            Đóng trình phát
          </Button>
        </section>
      )}

      <section className="mt-9 border-t border-line pt-6">
        <h2 className="font-display text-2xl">Video có sẵn trên điện thoại</h2>
        <p className="mt-1 text-sm text-muted">Ví dụ video đã tải từ ứng dụng EZVIZ hoặc tự quay. Video không bị tải lên đâu cả.</p>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFile} />
        <Button size="lg" className="mt-3" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          <IconUpload /> Chọn video từ máy
        </Button>
      </section>

      {busy && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="font-semibold">{busy.title}</div>
            <div className="mt-1 min-h-5 text-sm text-muted">{busy.detail}</div>
            {engine.phase === "downloading" && (
              <div className="mt-1 text-xs text-faint">Lần đầu cần tải bộ xử lý video (~30 MB){engine.ratio !== null ? ` · ${Math.round(engine.ratio * 100)}%` : ""}</div>
            )}
            <ProgressBar ratio={busy.ratio} className="mt-4" />
            <Button variant="ghost" className="mt-4 w-full" onClick={() => abortRef.current?.abort()}>
              Huỷ
            </Button>
          </Card>
        </div>
      )}
    </CustomerLayout>
  );
}
