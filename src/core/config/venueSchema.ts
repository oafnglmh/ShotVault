import type { BilliardTable, Camera, CameraConnection, VenueConfig } from "../domain/types";
import { DEFAULT_VENUE } from "./defaultVenue";

/** Hand-rolled validation: the config is public and editable, so never trust its shape. */
export class ConfigError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const ID_PATTERN = /^[A-Z0-9_-]{2,32}$/;

function parseConnection(v: unknown): CameraConnection {
  if (!isObj(v)) return { provider: "mock" };
  if (v.provider === "ezviz") {
    return {
      provider: "ezviz",
      deviceSerial: str(v.deviceSerial).trim().toUpperCase(),
      channelNo: Math.max(1, Math.round(num(v.channelNo, 1))),
    };
  }
  const demoClipUrl = str(v.demoClipUrl).trim();
  return demoClipUrl ? { provider: "mock", demoClipUrl } : { provider: "mock" };
}

function parseCamera(v: unknown): Camera {
  if (!isObj(v)) throw new ConfigError("Camera không hợp lệ");
  const id = str(v.id).trim();
  if (!ID_PATTERN.test(id)) throw new ConfigError(`Mã camera không hợp lệ: "${id}"`);
  return {
    id,
    name: str(v.name, id),
    model: str(v.model) || undefined,
    connection: parseConnection(v.connection),
    enabled: bool(v.enabled, true),
  };
}

function parseTable(v: unknown): BilliardTable {
  if (!isObj(v)) throw new ConfigError("Bàn không hợp lệ");
  const id = str(v.id).trim();
  if (!ID_PATTERN.test(id)) throw new ConfigError(`Mã bàn không hợp lệ: "${id}"`);
  return {
    id,
    name: str(v.name, id),
    cameraId: typeof v.cameraId === "string" && v.cameraId ? v.cameraId : null,
    active: bool(v.active, true),
    note: str(v.note) || undefined,
  };
}

function assertUnique(ids: string[], what: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new ConfigError(`Trùng mã ${what}: ${id}`);
    seen.add(id);
  }
}

export function parseVenueConfig(raw: unknown): VenueConfig {
  if (!isObj(raw)) throw new ConfigError("File cấu hình không phải JSON object");
  if (raw.schemaVersion !== 1) throw new ConfigError("schemaVersion không được hỗ trợ (cần 1)");
  const tables = Array.isArray(raw.tables) ? raw.tables.map(parseTable) : [];
  const cameras = Array.isArray(raw.cameras) ? raw.cameras.map(parseCamera) : [];
  assertUnique(tables.map((t) => t.id), "bàn");
  assertUnique(cameras.map((c) => c.id), "camera");
  const camIds = new Set(cameras.map((c) => c.id));
  for (const t of tables) if (t.cameraId && !camIds.has(t.cameraId)) t.cameraId = null;

  const ez = isObj(raw.ezviz) ? raw.ezviz : {};
  const lim = isObj(raw.limits) ? raw.limits : {};
  const d = DEFAULT_VENUE;
  return {
    schemaVersion: 1,
    venueName: str(raw.venueName, d.venueName),
    publicBaseUrl: str(raw.publicBaseUrl).trim().replace(/\/+$/, ""),
    tables,
    cameras,
    ezviz: {
      apiDomain: str(ez.apiDomain, d.ezviz.apiDomain).trim().replace(/\/+$/, ""),
      ezopenHost: str(ez.ezopenHost, d.ezviz.ezopenHost).trim(),
      viewerToken: str(ez.viewerToken).trim(),
      viewerTokenExpiresAt: typeof ez.viewerTokenExpiresAt === "number" ? ez.viewerTokenExpiresAt : null,
      recordingType: ez.recordingType === 3 ? 3 : 2,
    },
    limits: {
      maxClipSeconds: clamp(num(lim.maxClipSeconds, d.limits.maxClipSeconds), 5, 600),
      maxPreciseSeconds: clamp(num(lim.maxPreciseSeconds, d.limits.maxPreciseSeconds), 5, 180),
      maxFetchSeconds: clamp(num(lim.maxFetchSeconds, d.limits.maxFetchSeconds), 10, 900),
    },
    updatedAt: num(raw.updatedAt, 0),
  };
}

/** Safety net before exporting a config that will be published: refuse anything that smells like a secret. */
export function findSecretLeaks(config: VenueConfig): string[] {
  const text = JSON.stringify(config).toLowerCase();
  const leaks: string[] = [];
  for (const key of ["appsecret", "app_secret", "verifycode", "validcode", "password"]) {
    if (text.includes(key)) leaks.push(key);
  }
  return leaks;
}
