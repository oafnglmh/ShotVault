/** Time helpers. Video positions are seconds (float); wall-clock times are epoch ms. */

export function formatClock(seconds: number, withTenths = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = withTenths ? Math.floor(seconds * 10) / 10 : Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = withTenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** Parses "mm:ss", "h:mm:ss", "ss" or "ss.s" → seconds. Returns null when invalid. */
export function parseClock(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length === 0 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    if (!/^\d+(\.\d+)?$/.test(p)) return null;
    total = total * 60 + Number(p);
  }
  return Number.isFinite(total) ? total : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** EZVIZ ezopen playback format: YYYYMMDDHHmmss in the device's local time. */
export function toEzopenStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** EZVIZ Open API format: "yyyy-MM-dd HH:mm:ss" in local time. */
export function toApiDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatWallTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
