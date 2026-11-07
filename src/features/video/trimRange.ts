import type { TimeRange } from "@/core/domain/types";

/** Pure trim-range rules shared by the timeline and the editor. Unit-tested. */
export const MIN_CLIP_SECONDS = 1;

export function initialRange(duration: number, maxLen: number, anchor?: number): TimeRange {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  const len = Math.min(duration, Math.min(maxLen, 15));
  // Default: the last `len` seconds — customers usually want "what just happened".
  const end = anchor !== undefined ? Math.min(duration, anchor) : duration;
  return { start: Math.max(0, end - len), end };
}

/** Move one edge, keeping min/max length and bounds. The other edge is pushed only if needed. */
export function moveEdge(range: TimeRange, edge: "start" | "end", value: number, duration: number, maxLen: number): TimeRange {
  const v = round1(Math.min(duration, Math.max(0, value)));
  if (edge === "start") {
    let start = Math.min(v, duration - MIN_CLIP_SECONDS);
    start = Math.max(0, start);
    let end = range.end;
    if (end - start < MIN_CLIP_SECONDS) end = start + MIN_CLIP_SECONDS;
    if (end - start > maxLen) end = start + maxLen;
    return { start, end: Math.min(duration, round1(end)) };
  }
  let end = Math.max(v, MIN_CLIP_SECONDS);
  end = Math.min(duration, end);
  let start = range.start;
  if (end - start < MIN_CLIP_SECONDS) start = end - MIN_CLIP_SECONDS;
  if (end - start > maxLen) start = end - maxLen;
  return { start: Math.max(0, round1(start)), end };
}

/** Shift the whole selection, preserving its length. */
export function shiftRange(range: TimeRange, delta: number, duration: number): TimeRange {
  const len = range.end - range.start;
  const start = Math.min(Math.max(0, range.start + delta), Math.max(0, duration - len));
  return { start: round1(start), end: round1(start + len) };
}

export function rangeLength(r: TimeRange) {
  return Math.max(0, r.end - r.start);
}

const round1 = (v: number) => Math.round(v * 10) / 10;
