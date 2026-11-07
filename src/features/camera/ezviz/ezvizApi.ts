import { AppError } from "@/core/utils/errors";

/**
 * Minimal EZVIZ Open Platform REST client (https://open.ys7.com / *.ezvizlife.com).
 *
 * Every call here uses an accessToken that the caller supplies. The client never sees
 * appSecret except in `requestAccessToken`, which is an ADMIN-ONLY helper that runs in the
 * admin's own browser and keeps the secret in memory for the duration of one request.
 *
 * Endpoints follow the public EZVIZ docs; responses are {code: "200", msg, data}.
 * Endpoints marked "unverified" are written from documentation but have not been
 * exercised against a real device in this project yet.
 */

export interface EzvizResponse<T> {
  code: string;
  msg: string;
  data: T;
}

/** Known EZVIZ result codes we translate for customers. */
const CODE_MESSAGES: Record<string, { code: AppError["code"]; message: string }> = {
  "10002": { code: "CAMERA_AUTH", message: "Phiên truy cập camera đã hết hạn. Vui lòng báo nhân viên quán." },
  "10001": { code: "CONFIG", message: "Cấu hình camera không hợp lệ. Vui lòng báo nhân viên quán." },
  "10005": { code: "CAMERA_AUTH", message: "Ứng dụng EZVIZ của quán đang bị khoá." },
  "10017": { code: "CONFIG", message: "appKey không tồn tại." },
  "10030": { code: "CONFIG", message: "appKey và appSecret không khớp." },
  "10031": { code: "CAMERA_AUTH", message: "Tài khoản phụ không có quyền với camera này." },
  "20002": { code: "CONFIG", message: "Camera không tồn tại trong tài khoản EZVIZ." },
  "20007": { code: "CAMERA_OFFLINE", message: "Camera đang mất kết nối." },
  "20008": { code: "CAMERA_OFFLINE", message: "Camera không phản hồi. Vui lòng thử lại." },
  "20018": { code: "CAMERA_AUTH", message: "Tài khoản không có quyền với camera này." },
  "49999": { code: "NETWORK", message: "Máy chủ EZVIZ đang bận. Vui lòng thử lại." },
  "60019": {
    code: "CAMERA_UNSUPPORTED",
    message: "Camera đang bật mã hoá video. Quản trị viên cần tắt mã hoá để xem trên web.",
  },
  "60020": { code: "CAMERA_UNSUPPORTED", message: "Camera không hỗ trợ chức năng này." },
};

export class EzvizApi {
  constructor(private readonly domain: string) {}

  async post<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") body.set(k, String(v));
    let res: Response;
    try {
      res = await fetch(`${this.domain}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      // A failed fetch to a reachable domain is almost always CORS in this context.
      throw new AppError(
        navigator.onLine ? "CORS_BLOCKED" : "NETWORK",
        navigator.onLine
          ? "Trình duyệt không được phép gọi API EZVIZ trực tiếp (CORS) hoặc máy chủ không phản hồi."
          : "Không có kết nối mạng.",
        `${path}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) throw new AppError("NETWORK", `EZVIZ trả về HTTP ${res.status}`, path);
    const json = (await res.json()) as EzvizResponse<T>;
    if (String(json.code) !== "200") {
      const known = CODE_MESSAGES[String(json.code)];
      throw new AppError(known?.code ?? "PROCESSING_FAILED", known?.message ?? `EZVIZ lỗi ${json.code}: ${json.msg}`, `${path} → ${json.code} ${json.msg}`);
    }
    return json.data;
  }

  /** ADMIN-ONLY. POST /api/lapp/token/get. The secret is not stored anywhere by this code. */
  requestAccessToken(appKey: string, appSecret: string) {
    return this.post<{ accessToken: string; expireTime: number; areaDomain?: string }>("/api/lapp/token/get", {
      appKey,
      appSecret,
    });
  }

  /** ADMIN-ONLY (unverified). Issue a token for a RAM sub-account created in the EZVIZ console. */
  requestSubAccountToken(mainAccessToken: string, accountId: string) {
    return this.post<{ accessToken: string; expireTime: number }>("/api/lapp/ram/token/get", {
      accessToken: mainAccessToken,
      accountId,
    });
  }

  /** POST /api/lapp/device/info → status 1 = online, 0 = offline. */
  deviceInfo(accessToken: string, deviceSerial: string, signal?: AbortSignal) {
    return this.post<{ deviceSerial: string; deviceName: string; model: string; status: number; isEncrypt: number }>(
      "/api/lapp/device/info",
      { accessToken, deviceSerial },
      signal,
    );
  }

  /** (unverified) Recording segments in a window. recType: 1 = cloud, 2 = local SD card. */
  videoByTime(
    accessToken: string,
    deviceSerial: string,
    channelNo: number,
    startMs: number,
    endMs: number,
    recType: 1 | 2,
    signal?: AbortSignal,
  ) {
    return this.post<Array<{ startTime: number; endTime: number; recType: number }> | null>(
      "/api/lapp/video/by/time",
      { accessToken, deviceSerial, channelNo, startTime: startMs, endTime: endMs, recType },
      signal,
    );
  }

  /**
   * POST /api/lapp/v2/live/address/get.
   * type: 1 live, 2 local (SD) playback, 3 cloud playback.
   * protocol: 1 ezopen, 2 hls, 3 rtmp, 4 flv. Per docs, playback is only offered for ezopen/rtmp/flv.
   */
  playAddress(
    params: {
      accessToken: string;
      deviceSerial: string;
      channelNo: number;
      protocol: 1 | 2 | 3 | 4;
      type: 1 | 2 | 3;
      quality?: 1 | 2;
      startTime?: string;
      stopTime?: string;
      expireTime?: number;
    },
    signal?: AbortSignal,
  ) {
    return this.post<{ id: string; url: string; expireTime: string }>("/api/lapp/v2/live/address/get", params, signal);
  }
}
