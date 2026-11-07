import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { TimeRange } from "@/core/domain/types";
import { formatClock } from "@/core/utils/time";
import { cx } from "@/ui/kit";

/**
 * Trim timeline built for thumbs: 56px-tall track, oversized grab handles, drag anywhere on the
 * track to scrub, and an optional zoom that fits the selection ±10s so one finger-pixel isn't
 * several seconds on long recordings.
 */
export function Timeline({
  duration,
  range,
  currentTime,
  onRangeEdge,
  onSeek,
  onDragStateChange,
}: {
  duration: number;
  range: TimeRange;
  currentTime: number;
  onRangeEdge(edge: "start" | "end", value: number): void;
  onSeek(t: number): void;
  onDragStateChange?(dragging: boolean): void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<"start" | "end" | "scrub" | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const view = useMemo(() => {
    if (!zoomed || duration <= 0) return { from: 0, to: Math.max(duration, 0.001) };
    const pad = Math.max(10, (range.end - range.start) * 0.5);
    const from = Math.max(0, range.start - pad);
    const to = Math.min(duration, range.end + pad);
    return { from, to: Math.max(to, from + 1) };
    // Zoom window is captured when toggled/drag ends, not on every frame of a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed, duration, drag === null ? range.start : null, drag === null ? range.end : null]);

  const pct = (t: number) => ((Math.min(view.to, Math.max(view.from, t)) - view.from) / (view.to - view.from)) * 100;

  const timeAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return view.from + ratio * (view.to - view.from);
    },
    [view],
  );

  const begin = (kind: "start" | "end" | "scrub") => (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(kind);
    onDragStateChange?.(true);
    const t = timeAt(e.clientX);
    if (kind === "scrub") onSeek(t);
  };

  const move = (e: PointerEvent) => {
    if (!drag) return;
    const t = timeAt(e.clientX);
    if (drag === "scrub") onSeek(t);
    else {
      onRangeEdge(drag, t);
      onSeek(t);
    }
  };

  const end = () => {
    if (!drag) return;
    setDrag(null);
    onDragStateChange?.(false);
  };

  const key = (edge: "start" | "end") => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    const cur = edge === "start" ? range.start : range.end;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onRangeEdge(edge, cur - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onRangeEdge(edge, cur + step);
    else return;
    e.preventDefault();
  };

  const ticks = useMemo(() => {
    const span = view.to - view.from;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => span / s <= 8) ?? 600;
    const out: number[] = [];
    for (let t = Math.ceil(view.from / step) * step; t <= view.to; t += step) out.push(t);
    return out;
  }, [view]);

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>
          {formatClock(view.from)} – {formatClock(view.to)}
        </span>
        <button
          type="button"
          onClick={() => setZoomed((z) => !z)}
          className={cx("rounded-md px-2 py-1 font-medium", zoomed ? "bg-felt text-chalk" : "text-muted hover:text-chalk")}
        >
          {zoomed ? "Xem toàn bộ" : "Phóng to vùng chọn"}
        </button>
      </div>
      <div
        ref={trackRef}
        className="relative mx-2 h-14 touch-none rounded-lg border border-line bg-panel-2"
        onPointerDown={begin("scrub")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {ticks.map((t) => (
          <div key={t} className="absolute bottom-0 h-2 w-px bg-line-strong" style={{ left: `${pct(t)}%` }} />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-ink/60" style={{ width: `${pct(range.start)}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-lg bg-ink/60" style={{ width: `${100 - pct(range.end)}%` }} />
        <div
          className="absolute inset-y-0 border-y-2 border-felt-bright bg-felt/35"
          style={{ left: `${pct(range.start)}%`, width: `${pct(range.end) - pct(range.start)}%` }}
        />
        {(["start", "end"] as const).map((edge) => (
          <div
            key={edge}
            role="slider"
            tabIndex={0}
            aria-label={edge === "start" ? "Điểm bắt đầu" : "Điểm kết thúc"}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={edge === "start" ? range.start : range.end}
            aria-valuetext={formatClock(edge === "start" ? range.start : range.end, true)}
            onPointerDown={begin(edge)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={key(edge)}
            className="absolute inset-y-[-6px] z-10 flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
            style={{ left: `${pct(edge === "start" ? range.start : range.end)}%` }}
          >
            <div
              className={cx(
                "flex h-full w-4 items-center justify-center rounded-md bg-felt-bright shadow-[0_0_0_2px_#0b0d0c]",
                drag === edge && "bg-chalk",
              )}
            >
              <div className="h-5 w-0.5 rounded bg-ink/60" />
            </div>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-[-4px] z-20 w-0.5 -translate-x-1/2 bg-chalk" style={{ left: `${pct(currentTime)}%` }} />
      </div>
    </div>
  );
}
