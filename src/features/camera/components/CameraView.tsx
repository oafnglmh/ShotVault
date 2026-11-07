import { useEffect, useRef, useState } from "react";
import type { Camera } from "@/core/domain/types";
import { toAppError } from "@/core/utils/errors";
import { Spinner } from "@/ui/kit";
import type { CameraProvider, ViewHandle } from "../CameraProvider";

/**
 * Hosts a provider-owned view (EZUIKit player or the DEMO canvas). The provider owns the DOM
 * inside the container; React only owns the frame around it.
 */
export function CameraView({
  provider,
  camera,
  playback,
}: {
  provider: CameraProvider;
  camera: Camera;
  playback?: { startMs: number; endMs: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const startMs = playback?.startMs;
  const endMs = playback?.endMs;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let handle: ViewHandle | null = null;
    let cancelled = false;
    setState("loading");
    setError(null);
    const events = {
      onReady: () => !cancelled && setState("ready"),
      onError: (msg: string) => {
        if (cancelled) return;
        setError(msg);
        setState("error");
      },
    };
    const mount =
      startMs !== undefined && endMs !== undefined
        ? provider.mountPlaybackView(el, camera, { startMs, endMs }, events)
        : provider.mountLiveView(el, camera, events);
    mount
      .then((h) => {
        if (cancelled) h.destroy();
        else {
          handle = h;
          // EZUIKit doesn't always fire success for templates; reveal after mount.
          setTimeout(() => !cancelled && setState((s) => (s === "loading" ? "ready" : s)), 2500);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(toAppError(e).message);
        setState("error");
      });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [provider, camera, startMs, endMs]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
      <div ref={ref} className="absolute inset-0" />
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted">
          <Spinner />
          Đang kết nối camera…
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/90 p-6 text-center">
          <div>
            <div className="font-semibold text-danger">Không xem được camera</div>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
