import { AppError } from "@/core/utils/errors";
import { md5Hex } from "@/core/utils/md5";

/**
 * Imou Open Platform client for the ADMIN TEST PAGE ONLY (/admin/imou).
 *
 * Unlike EZVIZ, every Imou OpenAPI request is signed with appSecret, and live / SD-playback
 * addresses need the ADMIN accessToken (sub-account tokens are refused). So this client must
 * never run on customer pages: it lives in the admin's browser, keeps appSecret in memory
 * only, and is used to prove that a real camera is reachable. A production Imou integration
 * needs a small server that holds appSecret.
 *
 * Docs: https://open.imou.com/document/api/conventions/request/ (POST JSON, result.code "0" = ok)
 *       https://open.imou.com/document/api/conventions/sign/
 */

export const IMOU_DOMAINS: Array<[string, string]> = [
  ["https://openapi-sg.easy4ip.com", "Singapore (Việt Nam, châu Á)"],
  ["https://openapi-fk.easy4ip.com", "Frankfurt (châu Âu)"],
  ["https://openapi-or.easy4ip.com", "Oregon (châu Mỹ)"],
  ["https://openapi.lechange.cn", "Trung Quốc (乐橙)"],
];

/**
 * Imou servers send no CORS headers, so a browser cannot call them directly. Under `npm run dev`
 * calls go through the dev relay (scripts/imouDevProxy.ts); a deployed static site has no relay.
 */
export const IMOU_RELAY_AVAILABLE = import.meta.env.DEV;

export function imouStreamUrl(url: string): string {
  return IMOU_RELAY_AVAILABLE ? `/__imou/stream?url=${encodeURIComponent(url)}` : url;
}

/** hmac = current docs (HMAC-SHA256 keyed by hex SHA-256 of appSecret, Base64); md5 = legacy scheme. */
export type ImouSignMode = "hmac" | "md5";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export async function imouSign(mode: ImouSignMode, time: number, nonce: string, appSecret: string): Promise<string> {
  const raw = `time:${time},nonce:${nonce},appSecret:${appSecret}`;
  if (mode === "md5") return md5Hex(raw);
  const password = hex(await crypto.subtle.digest("SHA-256", enc.encode(appSecret)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  return btoa(String.fromCharCode(...mac));
}

/** Imou result codes worth translating for the admin. */
const CODE_HINTS: Record<string, string> = {
  SN1001: "Chữ ký sai: kiểm tra appSecret",
  SN1002: "Giờ máy tính lệch quá 5 phút so với máy chủ Imou",
  SN1004: "appId không hợp lệ",
  SN1005: "nonce bị trùng, thử lại",
  TK1002: "accessToken hết hạn, lấy lại token",
  TK1003: "accessToken không khớp appId",
  OP1002: "Thiếu tham số bắt buộc",
  OP1003: "Tham số không hợp lệ",
  OP1007: "Thiếu accessToken",
  OP1039: "Gọi quá nhiều trong 1 phút, chờ rồi thử lại",
  OP1040: "Vượt hạn mức gọi API",
  DV1007: "Camera offline hoặc không phản hồi",
};

export interface ImouCallLog {
  method: string;
  ok: boolean;
  code: string;
  msg: string;
  ms: number;
}

export class ImouError extends AppError {
  constructor(
    public imouCode: string,
    message: string,
    detail?: string,
  ) {
    super(imouCode.startsWith("DV") ? "CAMERA_OFFLINE" : imouCode.startsWith("TK") ? "CAMERA_AUTH" : "CONFIG", message, detail);
  }
}

export class ImouTestClient {
  signMode: ImouSignMode | null = null;
  private token: string | null = null;

  constructor(
    private readonly domain: string,
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly onLog?: (l: ImouCallLog) => void,
  ) {}

  get hasToken() {
    return !!this.token;
  }

  private async post(method: string, params: Record<string, unknown>, mode: ImouSignMode, signal?: AbortSignal) {
    const time = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();
    const body = {
      system: { ver: "1.0", appId: this.appId, sign: await imouSign(mode, time, nonce, this.appSecret), time, nonce },
      id: crypto.randomUUID(),
      params,
    };
    let res: Response;
    try {
      const endpoint = IMOU_RELAY_AVAILABLE
        ? `/__imou/api/${new URL(this.domain).host}/${method}`
        : `${this.domain}/openapi/${method}`;
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new AppError(
        navigator.onLine ? "CORS_BLOCKED" : "NETWORK",
        navigator.onLine
          ? "Trình duyệt không gọi được API Imou (bị chặn CORS hoặc sai máy chủ)."
          : "Không có kết nối mạng.",
        `${method}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) throw new AppError("NETWORK", `Imou trả về HTTP ${res.status}`, method);
    const json = (await res.json()) as { result?: { code?: string; msg?: string; data?: unknown } };
    return { code: String(json.result?.code ?? "?"), msg: String(json.result?.msg ?? ""), data: json.result?.data };
  }

  /** Signs with the known-good scheme; on the first call tries HMAC then falls back to MD5. */
  async call<T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const modes: ImouSignMode[] = this.signMode ? [this.signMode] : ["hmac", "md5"];
    const t0 = performance.now();
    let last = { code: "?", msg: "", data: undefined as unknown };
    for (const mode of modes) {
      last = await this.post(method, params, mode, signal);
      if (last.code !== "SN1001") {
        this.signMode = mode;
        break;
      }
    }
    const ok = last.code === "0";
    this.onLog?.({ method, ok, code: last.code, msg: last.msg, ms: Math.round(performance.now() - t0) });
    if (!ok) {
      const hint = CODE_HINTS[last.code];
      throw new ImouError(last.code, `${hint ?? "Imou báo lỗi"} (${last.code})`, `${method} → ${last.code} ${last.msg}`);
    }
    return last.data as T;
  }

  private tk(): string {
    if (!this.token) throw new AppError("CAMERA_AUTH", "Chưa lấy accessToken");
    return this.token;
  }

  /** Admin accessToken, valid 3 days. */
  async fetchAccessToken(signal?: AbortSignal) {
    const d = await this.call<{ accessToken: string; expireTime: number }>("accessToken", {}, signal);
    this.token = d.accessToken;
    return d;
  }

  /** Online state: v2 method first, legacy deviceOnline as fallback (older data centers). */
  async deviceOnline(deviceId: string, signal?: AbortSignal): Promise<{ online: boolean; raw: unknown }> {
    try {
      const d = await this.call<{ online: number }>("v2/device.status.get", { token: this.tk(), deviceId }, signal);
      return { online: d.online === 1, raw: d };
    } catch (e) {
      if (!(e instanceof ImouError) || e.imouCode.startsWith("DV") || e.imouCode.startsWith("TK")) throw e;
      const d = await this.call<{ onLine: string }>("deviceOnline", { token: this.tk(), deviceId }, signal);
      return { online: String(d.onLine) === "1", raw: d };
    }
  }

  localRecords(deviceId: string, channelId: string, beginTime: string, endTime: string, signal?: AbortSignal) {
    return this.call<{ records?: Array<{ recordId: string; beginTime: string; endTime: string; type: string; fileLength: number }> }>(
      "queryLocalRecords",
      { token: this.tk(), deviceId, channelId, beginTime, endTime, type: "All", count: 100 },
      signal,
    );
  }

  /**
   * HTTPS-FLV address (createDeviceFlvLive). realTime = live; playback + localRecord = SD card
   * window (max 24 h). If a live FLV already exists, falls back to queryDeviceFlvLive.
   */
  async flvAddress(
    deviceId: string,
    channelId: string,
    opts: { type: "realTime" } | { type: "playback"; beginTime: string; endTime: string },
    signal?: AbortSignal,
  ): Promise<string> {
    const params: Record<string, unknown> = { token: this.tk(), deviceId, channelId, type: opts.type };
    if (opts.type === "playback") Object.assign(params, { beginTime: opts.beginTime, endTime: opts.endTime, recordType: "localRecord" });
    let data: Record<string, unknown>;
    try {
      data = await this.call<Record<string, unknown>>("createDeviceFlvLive", params, signal);
    } catch (e) {
      if (opts.type !== "realTime" || !(e instanceof ImouError) || e.imouCode.startsWith("DV") || e.imouCode.startsWith("TK")) throw e;
      data = await this.call<Record<string, unknown>>("queryDeviceFlvLive", { token: this.tk(), deviceId, channelId }, signal);
    }
    const url = pickFlvUrl(data);
    if (!url) throw new AppError("CAMERA_UNSUPPORTED", "Imou không trả về địa chỉ FLV.", JSON.stringify(data).slice(0, 300));
    return url;
  }
}

/** Prefers flvHD, then flv, then any https .flv string anywhere in the response. */
export function pickFlvUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const k of ["flvHD", "flv"]) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  for (const v of Object.values(o)) {
    if (typeof v === "string" && /^https?:\/\/.+\.flv/i.test(v)) return v;
    const nested = Array.isArray(v) ? v.map(pickFlvUrl).find(Boolean) : typeof v === "object" ? pickFlvUrl(v) : null;
    if (nested) return nested;
  }
  return null;
}
