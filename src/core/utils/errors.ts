/**
 * Errors shown to customers. `code` drives which recovery actions the UI offers;
 * `message` is customer-friendly Vietnamese; `detail` is for admins/logs.
 */
export type AppErrorCode =
  | "CONFIG"
  | "NOT_FOUND"
  | "CAMERA_OFFLINE"
  | "CAMERA_AUTH"
  | "CAMERA_UNSUPPORTED"
  | "CORS_BLOCKED"
  | "NETWORK"
  | "TOO_LARGE"
  | "OUT_OF_MEMORY"
  | "CODEC_UNSUPPORTED"
  | "PROCESSING_FAILED"
  | "ABORTED"
  | "BROWSER_UNSUPPORTED"
  | "STORAGE";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAbort(e: unknown): boolean {
  return (
    (e instanceof AppError && e.code === "ABORTED") ||
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

export function toAppError(e: unknown, fallback: AppErrorCode = "PROCESSING_FAILED"): AppError {
  if (e instanceof AppError) return e;
  if (isAbort(e)) return new AppError("ABORTED", "Đã huỷ thao tác.");
  const msg = e instanceof Error ? e.message : String(e);
  if (/memory|allocation|RangeError|OOM|out of bounds/i.test(msg)) {
    return new AppError(
      "OUT_OF_MEMORY",
      "Điện thoại không đủ bộ nhớ để xử lý đoạn video này. Hãy chọn đoạn ngắn hơn hoặc đóng bớt ứng dụng khác.",
      msg,
    );
  }
  if (e instanceof TypeError && /fetch|network|load failed/i.test(msg)) {
    return new AppError("NETWORK", "Không kết nối được. Kiểm tra mạng Wi-Fi/4G rồi thử lại.", msg);
  }
  return new AppError(fallback, "Đã xảy ra lỗi khi xử lý. Vui lòng thử lại.", msg);
}
