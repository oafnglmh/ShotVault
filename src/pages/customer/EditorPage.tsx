import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { TimeRange } from "@/core/domain/types";
import { AppError, isAbort, toAppError } from "@/core/utils/errors";
import { formatClock, parseClock } from "@/core/utils/time";
import { exportHighlight, planForSource, probeSource } from "@/features/highlights/highlightService";
import { getVideoSourceUrl, useVideoSource } from "@/features/highlights/sourceStore";
import type { CutMode } from "@/features/processing/cutPlanner";
import { ffmpegService, type LoadState } from "@/features/processing/ffmpegService";
import { describeCodec, type ProbeInfo } from "@/features/processing/probe";
import { Timeline } from "@/features/video/Timeline";
import { initialRange, moveEdge, rangeLength } from "@/features/video/trimRange";
import { useVideoPlayer } from "@/features/video/useVideoPlayer";
import { IconLoop, IconPause, IconPlay, IconScissors } from "@/ui/icons";
import { Button, Card, ModeBadge, Notice, ProgressBar, Spinner, cx } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";

type Phase = "loading-engine" | "analyzing" | "cutting" | "saving";
const PHASE_LABEL: Record<Phase, string> = {
  "loading-engine": "Đang tải bộ xử lý video",
  analyzing: "Đang phân tích video",
  cutting: "Đang cắt highlight",
  saving: "Đang lưu",
};

/** Customer screen 5 — the trim editor. */
export function EditorPage() {
  const { table, camera, base, venue } = useTableContext();
  const source = useVideoSource(table.id);
  const navigate = useNavigate();
  const { videoRef, state, seek, toggle, pause, previewRange, updateLoop, looping } = useVideoPlayer();
  const [range, setRange] = useState<TimeRange>({ start: 0, end: 0 });
  const [mode, setMode] = useState<CutMode>("fast");
  const [probe, setProbe] = useState<ProbeInfo | null>(null);
  const [probing, setProbing] = useState(false);
  const [job, setJob] = useState<{ phase: Phase; ratio: number | null } | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [engine, setEngine] = useState<LoadState>(ffmpegService.state);
  const abortRef = useRef<AbortController | null>(null);
  const initialised = useRef(false);
  const url = source ? getVideoSourceUrl() : null;
  const maxLen = venue.limits.maxClipSeconds;

  useEffect(() => ffmpegService.onLoadState(setEngine), []);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Browser can't decode (e.g. H.265 on desktop Chrome): fall back to ffmpeg's view of the file.
  const playbackBroken = state.error === "unsupported" || state.error === "decode" || (state.ready && !state.hasVideoTrack);
  useEffect(() => {
    if (!source || !playbackBroken || probe || probing) return;
    setProbing(true);
    probeSource(source)
      .then(setProbe)
      .catch((e) => setError(toAppError(e)))
      .finally(() => setProbing(false));
  }, [source, playbackBroken, probe, probing]);

  const duration = state.ready && state.duration > 0 ? state.duration : probe?.durationSec ?? 0;

  useEffect(() => {
    if (!initialised.current && duration > 0) {
      initialised.current = true;
      const r = initialRange(duration, maxLen);
      setRange(r);
      seek(r.start);
    }
  }, [duration, maxLen, seek]);

  useEffect(() => updateLoop(range), [range, updateLoop]);

  const plan = useMemo(
    () => (source && duration > 0 ? planForSource(source, range, mode, venue.limits, probe) : null),
    [source, range, mode, venue.limits, probe, duration],
  );

  if (!source || !url) return <Navigate to={`${base}/recordings`} replace />;

  const setEdge = (edge: "start" | "end", v: number) => setRange((r) => moveEdge(r, edge, v, duration, maxLen));
  const nudge = (edge: "start" | "end", d: number) => {
    setRange((r) => {
      const next = moveEdge(r, edge, (edge === "start" ? r.start : r.end) + d, duration, maxLen);
      seek(edge === "start" ? next.start : next.end);
      return next;
    });
  };

  const startExport = async () => {
    pause();
    previewRange(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setJob({ phase: ffmpegService.isReady ? "analyzing" : "loading-engine", ratio: null });
    try {
      const h = await exportHighlight({
        source,
        range,
        mode,
        limits: venue.limits,
        table,
        camera,
        signal: ac.signal,
        onPhase: (phase) => setJob({ phase, ratio: phase === "cutting" ? 0 : null }),
        onProgress: (ratio) => setJob((j) => (j ? { ...j, ratio } : j)),
      });
      navigate(`${base}/highlight/${h.id}`);
    } catch (e) {
      if (!isAbort(e)) setError(toAppError(e));
    } finally {
      setJob(null);
    }
  };

  const len = rangeLength(range);

  return (
    <CustomerLayout back={`${base}/recordings`} title={<span className="font-semibold">Cắt highlight</span>} right={<ModeBadge mode={source.mode} />} wide>
      <div className="relative overflow-hidden rounded-xl border border-line bg-black">
        <video
          ref={videoRef}
          src={url}
          className="aspect-video w-full bg-black"
          playsInline
          // Local blob: "auto" lets iOS Safari render a frame after seeking without a play() first.
          preload="auto"
          onClick={toggle}
        />
        {!state.ready && !playbackBroken && (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <Spinner />
          </div>
        )}
        {playbackBroken && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/90 p-5 text-center text-sm">
            <div>
              <div className="font-semibold text-warn">Trình duyệt không xem trước được video này</div>
              <div className="mt-1 text-muted">
                {probing ? "Đang kiểm tra định dạng…" : probe ? `Định dạng: ${describeCodec(probe.videoCodec)}. Bạn vẫn có thể chọn thời gian và cắt; video tải về sẽ xem được trên hầu hết điện thoại.` : ""}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-1 text-xs text-faint">{source.label}</div>
      {source.partial && (
        <Notice tone="warn" className="mt-3">
          Camera chỉ trả về một phần đoạn yêu cầu (mạng chậm hoặc thẻ nhớ chưa ghi xong). Bạn vẫn có thể cắt phần đã nhận.
        </Notice>
      )}

      {duration > 0 && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" className="h-12 w-12 !px-0" onClick={toggle} disabled={playbackBroken} aria-label={state.playing ? "Tạm dừng" : "Phát"}>
              {state.playing ? <IconPause /> : <IconPlay />}
            </Button>
            <div className="font-mono text-sm tabular-nums text-muted">
              <span className="text-chalk">{formatClock(state.currentTime, true)}</span> / {formatClock(duration)}
            </div>
            <div className="flex-1" />
            <Button
              variant={looping ? "primary" : "secondary"}
              onClick={() => previewRange(looping ? null : range)}
              disabled={playbackBroken}
            >
              <IconLoop /> {looping ? "Dừng xem thử" : "Xem thử"}
            </Button>
          </div>

          <div className="mt-5">
            <Timeline
              duration={duration}
              range={range}
              currentTime={state.currentTime}
              onRangeEdge={setEdge}
              onSeek={seek}
              onDragStateChange={(d) => d && pause()}
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {(["start", "end"] as const).map((edge) => (
              <EdgeControl
                key={edge}
                label={edge === "start" ? "Bắt đầu" : "Kết thúc"}
                value={edge === "start" ? range.start : range.end}
                onSet={(v) => setEdge(edge, v)}
                onNudge={(d) => nudge(edge, d)}
                onHere={() => setEdge(edge, state.currentTime)}
                onJump={() => seek(edge === "start" ? range.start : range.end)}
                disabledHere={playbackBroken}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <span className="text-sm text-muted">Độ dài highlight</span>
            <span className={cx("font-mono text-lg tabular-nums", len > maxLen ? "text-danger" : "text-chalk")}>{formatClock(len, true)}</span>
          </div>

          <fieldset className="mt-5">
            <legend className="label">Kiểu cắt</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["fast", "Cắt nhanh", "Vài giây, giữ nguyên chất lượng"],
                  ["precise", "Cắt chính xác", `Chính xác từng khung, chậm hơn (≤ ${venue.limits.maxPreciseSeconds}s)`],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cx(
                    "cursor-pointer rounded-xl border px-3 py-3",
                    mode === value ? "border-felt-bright bg-felt/20" : "border-line bg-panel hover:border-line-strong",
                  )}
                >
                  <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                  <div className="text-sm font-semibold">{title}</div>
                  <div className="mt-0.5 text-xs leading-snug text-muted">{desc}</div>
                </label>
              ))}
            </div>
          </fieldset>

          {plan && !plan.ok && <Notice tone="warn" className="mt-4">{plan.reason}</Notice>}
          {plan?.ok && plan.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-faint">
              {plan.warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          )}
          {error && (
            <Notice tone="error" title="Cắt video thất bại" className="mt-4">
              {error.message}
              {error.code === "OUT_OF_MEMORY" && " Mẹo: dùng “Cắt nhanh” hoặc chọn đoạn ngắn hơn."}
              {error.code === "PROCESSING_FAILED" && mode === "fast" && " Hãy thử chế độ “Cắt chính xác”."}
            </Notice>
          )}

          <Button variant="primary" size="lg" className="mt-5" onClick={() => void startExport()} disabled={!plan?.ok || !!job}>
            <IconScissors /> Cắt & xuất MP4
          </Button>
        </>
      )}

      {job && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 p-4 sm:items-center">
          <Card className="w-full max-w-md p-5">
            <div className="font-semibold">{PHASE_LABEL[job.phase]}</div>
            <div className="mt-1 text-sm text-muted">
              {job.phase === "loading-engine"
                ? `Chỉ tải lần đầu (~30 MB)${engine.ratio !== null && engine.phase === "downloading" ? ` · ${Math.round(engine.ratio * 100)}%` : ""}`
                : "Video được xử lý ngay trên điện thoại, không tải lên máy chủ nào."}
            </div>
            <ProgressBar ratio={job.phase === "loading-engine" ? (engine.phase === "downloading" ? engine.ratio : null) : job.ratio} className="mt-4" />
            <p className="mt-3 text-xs text-faint">Giữ màn hình mở cho đến khi xong.</p>
            <Button variant="ghost" className="mt-3 w-full" onClick={() => abortRef.current?.abort()}>
              Huỷ
            </Button>
          </Card>
        </div>
      )}
    </CustomerLayout>
  );
}

function EdgeControl({
  label,
  value,
  onSet,
  onNudge,
  onHere,
  onJump,
  disabledHere,
}: {
  label: string;
  value: number;
  onSet(v: number): void;
  onNudge(d: number): void;
  onHere(): void;
  onJump(): void;
  disabledHere: boolean;
}) {
  const [text, setText] = useState(formatClock(value, true));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatClock(value, true));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = parseClock(text);
    if (v !== null) onSet(v);
    else setText(formatClock(value, true));
  };
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button type="button" className="text-xs text-felt-bright" onClick={onJump}>
          Tới điểm
        </button>
      </div>
      <input
        className="mt-1 w-full bg-transparent font-mono text-xl tabular-nums text-chalk focus:outline-none"
        value={text}
        inputMode="decimal"
        aria-label={`${label} (phút:giây)`}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
      <div className="mt-2 grid grid-cols-4 gap-1">
        {[-1, -0.1, 0.1, 1].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onNudge(d)}
            className="h-9 rounded-md border border-line text-xs font-medium text-muted hover:border-line-strong hover:text-chalk"
          >
            {d > 0 ? "+" : "−"}
            {Math.abs(d) < 1 ? "0.1" : "1"}s
          </button>
        ))}
      </div>
      <Button size="sm" className="mt-2 w-full" onClick={onHere} disabled={disabledHere} title="Đặt bằng vị trí đang xem trên video">
        Đặt tại đây
      </Button>
    </Card>
  );
}
