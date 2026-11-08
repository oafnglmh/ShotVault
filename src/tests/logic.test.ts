import { describe, expect, it, vi } from "vitest";
import { parseVenueConfig, findSecretLeaks, ConfigError } from "@/core/config/venueSchema";
import { DEFAULT_VENUE } from "@/core/config/defaultVenue";
import { formatClock, parseClock, toApiDateTime, toEzopenStamp } from "@/core/utils/time";
import { safeFileName } from "@/core/utils/ids";
import { initialRange, moveEdge, shiftRange } from "@/features/video/trimRange";
import { planCut } from "@/features/processing/cutPlanner";
import { parseProbeLog } from "@/features/processing/probe";
import { FlvTagScanner } from "@/features/camera/ezviz/flvStreamReader";

const limits = { maxClipSeconds: 120, maxPreciseSeconds: 45, maxFetchSeconds: 300 };

describe("time", () => {
  it("formats and parses clocks", () => {
    expect(formatClock(75)).toBe("01:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(5.27, true)).toBe("00:05.2");
    expect(parseClock("01:15")).toBe(75);
    expect(parseClock("1:02:05")).toBe(3725);
    expect(parseClock("12.5")).toBe(12.5);
    expect(parseClock("ab")).toBeNull();
    expect(parseClock("1:2:3:4")).toBeNull();
  });
  it("formats EZVIZ stamps in local time", () => {
    const ms = new Date(2026, 10, 7, 9, 5, 3).getTime();
    expect(toEzopenStamp(ms)).toBe("20261107090503");
    expect(toApiDateTime(ms)).toBe("2026-11-07 09:05:03");
  });
  it("makes Vietnamese names file-safe", () => {
    expect(safeFileName("Bàn 01 Đẹp")).toBe("Ban_01_Dep");
  });
});

describe("trim range", () => {
  it("defaults to the last 15s", () => {
    expect(initialRange(120, 120)).toEqual({ start: 105, end: 120 });
    expect(initialRange(8, 120)).toEqual({ start: 0, end: 8 });
  });
  it("keeps minimum length and bounds", () => {
    expect(moveEdge({ start: 10, end: 20 }, "start", 19.8, 60, 120)).toEqual({ start: 19.8, end: 20.8 });
    expect(moveEdge({ start: 10, end: 20 }, "end", -5, 60, 120)).toEqual({ start: 0, end: 1 });
    expect(moveEdge({ start: 10, end: 20 }, "end", 99, 60, 120)).toEqual({ start: 10, end: 60 });
  });
  it("enforces max length by pushing the other edge", () => {
    expect(moveEdge({ start: 100, end: 110 }, "start", 0, 300, 30)).toEqual({ start: 0, end: 30 });
    expect(moveEdge({ start: 0, end: 10 }, "end", 200, 300, 30)).toEqual({ start: 170, end: 200 });
  });
  it("shifts within bounds", () => {
    expect(shiftRange({ start: 50, end: 60 }, 100, 80)).toEqual({ start: 70, end: 80 });
    expect(shiftRange({ start: 5, end: 15 }, -10, 80)).toEqual({ start: 0, end: 10 });
  });
});

describe("cut planner", () => {
  const probe = (videoCodec: string) => ({ ...parseProbeLog(""), videoCodec });
  const base = { limits, lowMemory: false, inputBytes: 10e6, maxInputMb: 600 };
  it("allows fast cut for h264", () => {
    const p = planCut({ ...base, clipSeconds: 20, requested: "fast", probe: probe("h264") });
    expect(p.ok).toBe(true);
    expect(p.mode).toBe("fast");
  });
  it("forces re-encode for non-MP4 codecs", () => {
    const p = planCut({ ...base, clipSeconds: 20, requested: "fast", probe: probe("vp9") });
    expect(p.mode).toBe("precise");
    expect(p.ok).toBe(true);
  });
  it("blocks precise cuts over the device limit", () => {
    expect(planCut({ ...base, clipSeconds: 40, requested: "precise", probe: probe("h264"), lowMemory: true }).ok).toBe(false);
    expect(planCut({ ...base, clipSeconds: 40, requested: "precise", probe: probe("h264") }).ok).toBe(true);
  });
  it("blocks clips over the max length", () => {
    expect(planCut({ ...base, clipSeconds: 121, requested: "fast", probe: probe("h264") }).ok).toBe(false);
  });
});

describe("ffmpeg probe log", () => {
  it("parses an EZVIZ-like FLV banner", () => {
    const log = `Input #0, flv, from '/in_x/a.flv':
  Duration: 00:02:00.04, start: 0.000000, bitrate: 2048 kb/s
  Stream #0:0: Video: hevc (Main), yuv420p(tv), 2560x1440, 15 fps, 15 tbr, 1k tbn
  Stream #0:1: Audio: pcm_alaw, 8000 Hz, mono, s16, 64 kb/s`;
    const p = parseProbeLog(log);
    expect(p.container).toBe("flv");
    expect(p.durationSec).toBeCloseTo(120.04);
    expect(p.videoCodec).toBe("hevc");
    expect(p.width).toBe(2560);
    expect(p.fps).toBe(15);
    expect(p.audioCodec).toBe("pcm_alaw");
  });
  it("parses mp4 with language tags", () => {
    const p = parseProbeLog(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.mp4':
  Duration: 00:00:40.00, start: 0.000000, bitrate: 900 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 960x540, 15 fps`);
    expect(p.container).toBe("mov");
    expect(p.videoCodec).toBe("h264");
    expect(p.audioCodec).toBeNull();
  });
});

describe("FLV tag scanner", () => {
  const header = () => new Uint8Array([0x46, 0x4c, 0x56, 1, 5, 0, 0, 0, 9, 0, 0, 0, 0]);
  const tag = (type: number, ts: number, size = 4) => {
    const t = new Uint8Array(11 + size + 4);
    t[0] = type;
    t[1] = (size >> 16) & 0xff;
    t[2] = (size >> 8) & 0xff;
    t[3] = size & 0xff;
    t[4] = (ts >> 16) & 0xff;
    t[5] = (ts >> 8) & 0xff;
    t[6] = ts & 0xff;
    t[7] = (ts >> 24) & 0xff;
    return t;
  };
  it("tracks media time across split chunks, relative to first tag", () => {
    const s = new FlvTagScanner();
    const all = new Uint8Array([...header(), ...tag(9, 1000), ...tag(8, 1500), ...tag(9, 4000)]);
    expect(s.push(all.slice(0, 20))).toBe(0);
    expect(s.push(all.slice(20, 40))).toBe(0);
    expect(s.push(all.slice(40))).toBe(3000);
    expect(s.validFlv).toBe(true);
  });
  it("flags non-FLV payloads", () => {
    const s = new FlvTagScanner();
    s.push(new TextEncoder().encode('{"code":"10002","msg":"token expired"}'));
    expect(s.validFlv).toBe(false);
  });
});

describe("venue config", () => {
  it("round-trips the default config", () => {
    expect(parseVenueConfig(JSON.parse(JSON.stringify(DEFAULT_VENUE)))).toEqual(DEFAULT_VENUE);
  });
  it("rejects bad ids and duplicates", () => {
    expect(() => parseVenueConfig({ ...DEFAULT_VENUE, tables: [{ id: "bad id" }] })).toThrow(ConfigError);
    expect(() => parseVenueConfig({ ...DEFAULT_VENUE, tables: [DEFAULT_VENUE.tables[0], DEFAULT_VENUE.tables[0]] })).toThrow(ConfigError);
  });
  it("drops dangling camera references and unknown fields", () => {
    const c = parseVenueConfig({
      ...DEFAULT_VENUE,
      tables: [{ id: "TABLE_09", name: "x", cameraId: "NOPE", active: true }],
      ezviz: { ...DEFAULT_VENUE.ezviz, appSecret: "leak" },
    });
    expect(c.tables[0].cameraId).toBeNull();
    expect(JSON.stringify(c)).not.toContain("leak");
  });
  it("detects secret-looking keys", () => {
    const leaky = { ...DEFAULT_VENUE, venueName: "my appSecret is x" };
    expect(findSecretLeaks(leaky)).toContain("appsecret");
    expect(findSecretLeaks(DEFAULT_VENUE)).toEqual([]);
  });
});

describe("QR table links", () => {
  it("end with a slash and round-trip through the scanner parser", async () => {
    vi.stubGlobal("window", { location: { origin: "https://shotvault.onrender.com" } });
    const { tableUrl, parseTableFromScan } = await import("@/features/qr/qrService");
    const url = tableUrl({ publicBaseUrl: "https://shotvault.onrender.com" } as Parameters<typeof tableUrl>[0], "TABLE_01");
    expect(url).toBe("https://shotvault.onrender.com/play/TABLE_01/");
    expect(parseTableFromScan(url)).toBe("TABLE_01");
    expect(parseTableFromScan("https://shotvault.onrender.com/play/TABLE_01")).toBe("TABLE_01");
    vi.unstubAllGlobals();
  });
});
