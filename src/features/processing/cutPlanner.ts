import type { ClipLimits } from "@/core/domain/types";
import type { ProbeInfo } from "./probe";

/** Pure decision logic for "can we cut this, and how?". Unit-tested; no browser APIs. */
export type CutMode = "fast" | "precise";

export interface CutPlan {
  ok: boolean;
  mode: CutMode;
  /** Blocking reason (ok = false). */
  reason?: string;
  /** Non-blocking advice for the customer. */
  warnings: string[];
  maxHeight: number;
}

const COPYABLE_TO_MP4 = new Set(["h264", "hevc"]);

export function planCut(input: {
  clipSeconds: number;
  requested: CutMode;
  limits: ClipLimits;
  probe: ProbeInfo | null;
  lowMemory: boolean;
  inputBytes: number;
  maxInputMb: number;
}): CutPlan {
  const warnings: string[] = [];
  let mode = input.requested;
  const codec = input.probe?.videoCodec ?? null;

  if (codec && !COPYABLE_TO_MP4.has(codec)) {
    if (mode === "fast") warnings.push(`Video gốc dùng mã ${codec.toUpperCase()}, cần mã hoá lại sang H.264 để xuất MP4.`);
    mode = "precise";
  }

  if (input.clipSeconds > input.limits.maxClipSeconds) {
    return { ok: false, mode, warnings, maxHeight: 1080, reason: `Highlight tối đa ${input.limits.maxClipSeconds} giây. Hãy rút ngắn đoạn chọn.` };
  }

  const preciseLimit = input.lowMemory ? Math.min(30, input.limits.maxPreciseSeconds) : input.limits.maxPreciseSeconds;
  if (mode === "precise" && input.clipSeconds > preciseLimit) {
    return {
      ok: false,
      mode,
      warnings,
      maxHeight: 720,
      reason: `Cắt chính xác (mã hoá lại) chỉ hỗ trợ tối đa ${preciseLimit} giây trên thiết bị này.${
        codec && COPYABLE_TO_MP4.has(codec) ? " Hãy dùng chế độ Cắt nhanh." : ""
      }`,
    };
  }

  if (codec === "hevc" && mode === "precise" && input.lowMemory) {
    warnings.push("Video H.265 mã hoá lại trên điện thoại sẽ khá chậm.");
  }

  // WORKERFS reads input lazily, but very large inputs still slow seeking/demuxing on phones.
  if (input.inputBytes > input.maxInputMb * 1024 * 1024) {
    warnings.push("Video gốc rất lớn, quá trình xử lý có thể chậm hoặc bị trình duyệt dừng.");
  }

  if (mode === "fast") warnings.push("Cắt nhanh bắt đầu tại khung hình chính gần nhất nên có thể sớm hơn điểm chọn khoảng 1–2 giây.");

  return { ok: true, mode, warnings, maxHeight: input.lowMemory ? 720 : 1080 };
}
