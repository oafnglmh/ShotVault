import { useEffect, useMemo, useRef, useState } from "react";
import { AppError, toAppError } from "@/core/utils/errors";
import { formatBytes, formatWallTime, toApiDateTime } from "@/core/utils/time";
import { readFlvStream } from "@/features/camera/ezviz/flvStreamReader";
import { IMOU_DOMAINS, IMOU_RELAY_AVAILABLE, ImouTestClient, imouStreamUrl, type ImouCallLog } from "@/features/camera/imou/imouApi";
import { ffmpegService } from "@/features/processing/ffmpegService";
import { describeCodec } from "@/features/processing/probe";
import { Button, Card, Field, Notice, ProgressBar } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

type LogLine = { at: number; ok: boolean; text: string };
type Clip = { url: string; info: string; fileName: string };
type Rec = { beginTime: string; endTime: string; type: string };

/**
 * Test bench for a real Imou camera. Nothing here touches venue.json or the customer pages:
 * appId/appSecret/accessToken live in this component's memory and vanish on reload.
 */
export function ImouPage() {
  const [domain, setDomain] = useState(IMOU_DOMAINS[0][0]);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [channelId, setChannelId] = useState("0");
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [records, setRecords] = useState<Rec[] | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const push = (ok: boolean, text: string) => setLog((l) => [...l, { at: Date.now(), ok, text }]);
  const onApiLog = (c: ImouCallLog) => push(c.ok, `${c.method} → ${c.code}${c.msg ? ` ${c.msg}` : ""} (${c.ms} ms)`);

  // A new client whenever the credentials change; the token is fetched again in step 1.
  const client = useMemo(
    () => (appId.trim() && appSecret.trim() ? new ImouTestClient(domain, appId.trim(), appSecret.trim(), onApiLog) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domain, appId, appSecret],
  );
  useEffect(() => setConnected(false), [client]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url);
  }, [clip]);

  const dev = deviceId.trim().toUpperCase();
  const ch = channelId.trim() || "0";

  const run = async (label: string, job: (c: ImouTestClient, signal: AbortSignal) => Promise<void>) => {
    if (!client) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(label);
    setProgress(null);
    try {
      await job(client, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) {
        const err = e instanceof AppError ? e : toAppError(e);
        push(false, `${label}: ${err.message}${err.detail ? ` — ${err.detail}` : ""}`);
      }
    } finally {
      if (abortRef.current === ac) setBusy(null);
    }
  };

  const connect = () =>
    run("Lấy accessToken", async (c, signal) => {
      const t = await c.fetchAccessToken(signal);
      setConnected(true);
      push(true, `Kết nối tài khoản thành công · chữ ký ${c.signMode === "md5" ? "MD5" : "HMAC-SHA256"} · token còn ${Math.round(t.expireTime / 3600)} giờ`);
    });

  const checkOnline = () =>
    run("Kiểm tra online", async (c, signal) => {
      const r = await c.deviceOnline(dev, signal);
      push(r.online, r.online ? `Camera ${dev} đang online` : `Camera ${dev} đang offline · ${JSON.stringify(r.raw)}`);
    });

  const listRecords = () =>
    run("Ghi hình thẻ nhớ", async (c, signal) => {
      const end = Date.now();
      // queryLocalRecords works per day; clamp the 3-hour window to today.
      const startOfDay = new Date(end).setHours(0, 0, 0, 0);
      const begin = Math.max(startOfDay, end - 3 * 3600_000);
      const d = await c.localRecords(dev, ch, toApiDateTime(begin), toApiDateTime(end), signal);
      const rows = (d.records ?? []).map((r) => ({ beginTime: r.beginTime, endTime: r.endTime, type: r.type })).reverse();
      setRecords(rows);
      push(rows.length > 0, rows.length ? `Có ${rows.length} đoạn ghi hình trên thẻ nhớ trong 3 giờ qua` : "Không có đoạn ghi hình nào: kiểm tra thẻ nhớ và chế độ ghi");
    });

  /** Download `seconds` of FLV, remux to MP4 with ffmpeg.wasm and show it, exactly like the customer flow. */
  const grab = (label: string, seconds: number, opts: { type: "realTime" } | { type: "playback"; beginTime: string; endTime: string }) =>
    run(label, async (c, signal) => {
      setClip(null);
      const url = await c.flvAddress(dev, ch, opts, signal);
      push(true, `Có địa chỉ FLV: ${new URL(url).host}`);
      let res: Response;
      try {
        res = await fetch(imouStreamUrl(url), { signal });
      } catch (e) {
        if (signal.aborted) throw e;
        throw new AppError("CORS_BLOCKED", "Máy chủ video Imou chặn trình duyệt tải trực tiếp (CORS)", e instanceof Error ? e.message : String(e));
      }
      if (!res.ok || !res.body) throw new AppError("NETWORK", `Máy chủ video Imou trả về HTTP ${res.status}`);
      const durationMs = seconds * 1000;
      const flv = await readFlvStream(res.body, {
        durationMs,
        maxBytes: 80 * 1024 * 1024,
        stallTimeoutMs: 20_000,
        signal,
        onProgress: (mediaMs) => setProgress(Math.min(1, mediaMs / durationMs)),
      });
      if (!flv.bytes) throw new AppError("CAMERA_UNSUPPORTED", "Không nhận được dữ liệu video");
      push(true, `Tải được ${formatBytes(flv.bytes)}, ${(flv.mediaMs / 1000).toFixed(1)} giây video (${flv.reason})`);
      setProgress(null);
      const blob = new Blob(flv.chunks as BlobPart[], { type: "video/x-flv" });
      const name = `imou_${dev}_${Date.now()}.flv`;
      const probe = await ffmpegService.probe(blob, name, signal);
      const mp4 = await ffmpegService.remuxToMp4(blob, name, { probe, signal, onProgress: setProgress });
      const info = `video ${describeCodec(probe.videoCodec)}${probe.width ? ` ${probe.width}×${probe.height}` : ""} · audio ${probe.audioCodec ?? "không có"} · MP4 ${formatBytes(mp4.size)}`;
      push(!!probe.videoCodec, `Chuyển sang MP4 thành công: ${info}`);
      setClip({ url: URL.createObjectURL(mp4), info, fileName: name.replace(/\.flv$/, ".mp4") });
    });

  const grabLive = () => grab("Lấy 10 giây trực tiếp", 10, { type: "realTime" });
  const grabPlayback = (startMs: number, seconds: number) =>
    grab(`Lấy ${seconds} giây ghi hình`, seconds, {
      type: "playback",
      beginTime: toApiDateTime(startMs),
      endTime: toApiDateTime(startMs + seconds * 1000),
    });
  const parseTime = (s: string) => new Date(s.replace(" ", "T")).getTime();

  const ready = !!client && !!dev && connected && !busy;

  return (
    <>
      <PageHeader title="Thử camera IMOU">
        Kiểm tra camera Imou thật: kết nối tài khoản, xem camera online, lấy video trực tiếp và video thẻ nhớ rồi chuyển sang MP4 như khách
        dùng. Trang này không thay đổi cấu hình website.
      </PageHeader>

      <Notice tone="warn" title="Chỉ dùng để thử nghiệm">
        Imou bắt buộc ký mọi lệnh bằng appSecret và chỉ cho lấy video bằng token quản trị. appSecret chỉ nằm trong bộ nhớ trang này, mất khi tải
        lại trang, không được lưu hay xuất bản. Muốn khách dùng camera Imou thật cần thêm một máy chủ nhỏ giữ appSecret.
      </Notice>

      {!IMOU_RELAY_AVAILABLE && (
        <Notice tone="error" title="Trang này chỉ chạy khi mở bằng npm run dev" className="mt-4">
          Máy chủ Imou chặn trình duyệt gọi trực tiếp (CORS), nên bản deploy trên Render không gọi được. Trên máy tính có mã nguồn, chạy
          <code className="mx-1">npm run dev</code>rồi mở <code className="mx-1">http://localhost:5173/admin/imou</code>.
        </Notice>
      )}

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl">1. Kết nối tài khoản</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Máy chủ (data center)" hint="Tài khoản Imou đăng ký ở Việt Nam thường thuộc Singapore.">
            <select className="field" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {IMOU_DOMAINS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="appId" hint="open.imoulife.com → Console → My Application.">
            <input className="field font-mono" value={appId} onChange={(e) => setAppId(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="appSecret (không lưu)">
            <input
              className="field font-mono"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="SN camera" hint="Trong app Imou: Cài đặt thiết bị → SN.">
              <input className="field font-mono" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="8E09309PAZA0691" spellCheck={false} />
            </Field>
            <Field label="Kênh" hint="Thường là 0.">
              <input className="field font-mono" value={channelId} onChange={(e) => setChannelId(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void connect()} disabled={!client || !!busy} busy={busy === "Lấy accessToken"}>
            Kết nối
          </Button>
          {connected && <span className="self-center text-sm text-felt-bright">Đã kết nối</span>}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl">2. Thử camera</h2>
        <p className="mt-1 text-sm text-muted">Cần kết nối và nhập SN trước. Lần đầu lấy video sẽ tải bộ xử lý video khoảng 30 MB.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void checkOnline()} disabled={!ready}>Kiểm tra online</Button>
          <Button onClick={() => void grabLive()} disabled={!ready}>Lấy 10 giây trực tiếp</Button>
          <Button onClick={() => void listRecords()} disabled={!ready}>Ghi hình thẻ nhớ 3 giờ qua</Button>
          <Button onClick={() => void grabPlayback(Date.now() - 2 * 60_000, 15)} disabled={!ready}>Lấy 15 giây từ 2 phút trước</Button>
          {busy && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              Huỷ
            </Button>
          )}
        </div>
        {busy && (
          <div className="mt-4">
            <div className="text-sm text-muted">{busy}…</div>
            <ProgressBar ratio={progress} className="mt-2" />
          </div>
        )}

        {records && records.length > 0 && (
          <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto">
            {records.map((r) => (
              <li key={r.beginTime} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex-1 font-mono">
                  {r.beginTime.slice(11)} – {r.endTime.slice(11)}
                </span>
                <span className="text-xs text-faint">{r.type}</span>
                <Button size="sm" onClick={() => void grabPlayback(parseTime(r.beginTime), 15)} disabled={!ready}>
                  Lấy 15 giây
                </Button>
              </li>
            ))}
          </ul>
        )}

        {clip && (
          <div className="mt-5">
            <video src={clip.url} className="aspect-video w-full max-w-2xl rounded-xl border border-line bg-black" controls playsInline autoPlay muted />
            <div className="mt-2 text-sm text-muted">{clip.info}</div>
            <a className="mt-2 inline-block text-sm text-felt-bright underline" href={clip.url} download={clip.fileName}>
              Tải MP4 về máy
            </a>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Nhật ký</h2>
          {log.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLog([])}>
              Xoá
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">Gửi phần này cho người hỗ trợ nếu có lỗi. Nhật ký không chứa appSecret hay token.</p>
        {log.length === 0 ? (
          <div className="mt-3 text-sm text-faint">Chưa có gì.</div>
        ) : (
          <ol className="mt-3 space-y-1 font-mono text-xs">
            {log.map((l, i) => (
              <li key={i} className={l.ok ? "text-chalk" : "text-warn"}>
                {formatWallTime(l.at)} {l.ok ? "✓" : "✗"} <span className="break-all">{l.text}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
