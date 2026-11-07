import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/ui/kit";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

/**
 * Rear-camera QR scanner. Uses the native BarcodeDetector when available (Android Chrome),
 * falls back to jsQR on a downscaled canvas (iOS Safari). Requires HTTPS.
 */
export function QrScanner({ onResult }: { onResult(text: string): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    let busy = false;
    // jsQR (~130 KB) is only needed where the native detector is missing (iOS Safari).
    let jsQR: typeof import("jsqr").default | null = null;
    if (!detector) void import("jsqr").then((m) => (jsQR = m.default));

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && !busy) {
        busy = true;
        try {
          let text: string | null = null;
          if (detector) {
            const codes = await detector.detect(v);
            text = codes[0]?.rawValue ?? null;
          } else if (ctx && jsQR) {
            const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
          if (text && !stopped) {
            stopped = true;
            navigator.vibrate?.(40);
            onResultRef.current(text);
            return;
          }
        } catch {
          /* transient detect errors are fine; keep scanning */
        } finally {
          busy = false;
        }
      }
      raf = requestAnimationFrame(() => void tick());
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt cần kết nối HTTPS để mở camera. Bạn có thể dùng ứng dụng Camera của điện thoại để quét mã.");
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setStarting(false);
        raf = requestAnimationFrame(() => void tick());
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Bạn đã từ chối quyền camera. Hãy cho phép trong cài đặt trình duyệt, hoặc dùng ứng dụng Camera để quét mã."
            : "Không mở được camera trên thiết bị này.",
        );
        setStarting(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      {!error && (
        <div className="pointer-events-none absolute inset-[16%] rounded-2xl border-2 border-chalk/80 shadow-[0_0_0_9999px_rgba(11,13,12,0.55)]" />
      )}
      {starting && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-muted">
          <Spinner />
        </div>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">{error}</div>}
    </div>
  );
}
