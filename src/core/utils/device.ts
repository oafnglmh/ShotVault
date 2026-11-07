/** Runtime capability detection. Everything is feature-tested, never user-agent guessed, except iOS hints. */

export interface DeviceCapabilities {
  secureContext: boolean;
  webAssembly: boolean;
  moduleWorker: boolean;
  indexedDb: boolean;
  shareFiles: boolean;
  cameraAccess: boolean;
  barcodeDetector: boolean;
  /** GB, Chromium-only; null when unknown (Safari/Firefox). */
  deviceMemoryGb: number | null;
  isIOS: boolean;
  isAndroid: boolean;
  h264: boolean;
  hevc: boolean;
}

function canPlay(type: string): boolean {
  try {
    const v = document.createElement("video");
    if (v.canPlayType(type) !== "") return true;
    return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(type);
  } catch {
    return false;
  }
}

function supportsModuleWorker(): boolean {
  let supports = false;
  try {
    const tester = {
      get type() {
        supports = true;
        return "module" as const;
      },
    };
    const w = new Worker("data:,", tester as WorkerOptions);
    w.terminate();
  } catch {
    /* ignore */
  }
  return supports;
}

let cached: DeviceCapabilities | null = null;

export function getDeviceCapabilities(): DeviceCapabilities {
  if (cached) return cached;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let shareFiles = false;
  try {
    const probe = new File([new Blob(["x"], { type: "video/mp4" })], "probe.mp4", { type: "video/mp4" });
    shareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
  } catch {
    shareFiles = false;
  }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  cached = {
    secureContext: window.isSecureContext,
    webAssembly: typeof WebAssembly === "object",
    moduleWorker: supportsModuleWorker(),
    indexedDb: typeof indexedDB !== "undefined",
    shareFiles,
    cameraAccess: !!navigator.mediaDevices?.getUserMedia,
    barcodeDetector: "BarcodeDetector" in window,
    deviceMemoryGb: typeof mem === "number" ? mem : null,
    isIOS,
    isAndroid: /Android/i.test(ua),
    h264: canPlay('video/mp4; codecs="avc1.42E01E"'),
    hevc: canPlay('video/mp4; codecs="hvc1.1.6.L93.B0"') || canPlay('video/mp4; codecs="hev1.1.6.L93.B0"'),
  };
  return cached;
}

/** Conservative budget for in-browser processing based on what we know about memory. */
export function processingBudget(): { maxInputMb: number; lowMemory: boolean } {
  const caps = getDeviceCapabilities();
  const mem = caps.deviceMemoryGb;
  // iOS Safari tabs get killed well before device RAM is exhausted; treat as low-memory.
  const lowMemory = caps.isIOS || (mem !== null && mem <= 3);
  return { maxInputMb: lowMemory ? 250 : mem !== null && mem >= 8 ? 1200 : 600, lowMemory };
}
