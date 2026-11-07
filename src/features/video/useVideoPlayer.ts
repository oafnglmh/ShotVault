import { useCallback, useEffect, useRef, useState } from "react";
import type { TimeRange } from "@/core/domain/types";

export interface PlayerState {
  ready: boolean;
  playing: boolean;
  duration: number;
  currentTime: number;
  error: "decode" | "unsupported" | "network" | null;
  hasVideoTrack: boolean;
}

/**
 * Controls a <video> element. Also supports "preview loop": play only inside a range and jump
 * back to its start when reaching the end.
 */
export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loopRef = useRef<TimeRange | null>(null);
  const [state, setState] = useState<PlayerState>({
    ready: false,
    playing: false,
    duration: 0,
    currentTime: 0,
    error: null,
    hasVideoTrack: true,
  });
  const [looping, setLooping] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const sync = () => {
      const loop = loopRef.current;
      if (loop && !v.paused && v.currentTime >= loop.end) v.currentTime = loop.start;
      setState((s) => (Math.abs(s.currentTime - v.currentTime) > 0.03 ? { ...s, currentTime: v.currentTime } : s));
      raf = requestAnimationFrame(sync);
    };
    const onMeta = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      setState((s) => ({ ...s, ready: d > 0, duration: d, hasVideoTrack: v.videoWidth > 0 || v.videoHeight > 0, error: null }));
    };
    // Safari reports Infinity for some fragmented files until data arrives.
    const onDuration = onMeta;
    const onLoadedData = () => {
      if (v.videoWidth === 0) setState((s) => ({ ...s, hasVideoTrack: false }));
    };
    const onPlay = () => setState((s) => ({ ...s, playing: true }));
    const onPause = () => setState((s) => ({ ...s, playing: false }));
    const onError = () => {
      const code = v.error?.code;
      setState((s) => ({
        ...s,
        ready: false,
        error: code === 4 ? "unsupported" : code === 3 ? "decode" : code === 2 ? "network" : "unsupported",
      }));
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onDuration);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("error", onError);
    raf = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onDuration);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onError);
    };
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(t)) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    setState((s) => ({ ...s, currentTime: v.currentTime }));
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const pause = useCallback(() => videoRef.current?.pause(), []);

  const previewRange = useCallback((range: TimeRange | null) => {
    const v = videoRef.current;
    loopRef.current = range;
    setLooping(!!range);
    if (!v) return;
    if (range) {
      v.currentTime = range.start;
      void v.play().catch(() => undefined);
    }
  }, []);

  /** Keep the loop bounds in sync when the selection is edited during preview. */
  const updateLoop = useCallback((range: TimeRange) => {
    if (loopRef.current) loopRef.current = range;
  }, []);

  return { videoRef, state, seek, toggle, pause, previewRange, updateLoop, looping };
}
