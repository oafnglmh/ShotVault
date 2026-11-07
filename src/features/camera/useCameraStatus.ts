import { useCallback, useEffect, useState } from "react";
import type { Camera, CameraStatus } from "@/core/domain/types";
import type { CameraProvider } from "./CameraProvider";

export function useCameraStatus(provider: CameraProvider | null, camera: Camera | null) {
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!provider || !camera) return;
    const ac = new AbortController();
    setChecking(true);
    provider
      .checkStatus(camera, ac.signal)
      .then((s) => !ac.signal.aborted && setStatus(s))
      .catch(() => undefined)
      .finally(() => !ac.signal.aborted && setChecking(false));
    return () => ac.abort();
  }, [provider, camera, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { status, checking, refresh };
}
