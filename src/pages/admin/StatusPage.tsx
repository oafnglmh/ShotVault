import { useState } from "react";
import type { Camera, CameraStatus } from "@/core/domain/types";
import { getDeviceCapabilities } from "@/core/utils/device";
import { AppError, toAppError } from "@/core/utils/errors";
import { formatBytes, formatWallTime } from "@/core/utils/time";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { CameraView } from "@/features/camera/components/CameraView";
import { getCameraProvider } from "@/features/camera/providerRegistry";
import { ffmpegService } from "@/features/processing/ffmpegService";
import { describeCodec } from "@/features/processing/probe";
import { Button, Card, HealthDot, ModeBadge, Notice } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function StatusPage() {
  const { draft } = useAdminDraft();
  if (!draft) return null;
  return (
    <>
      <PageHeader title="Trạng thái camera">
        Kiểm tra từng camera bằng cấu hình nháp hiện tại. Mục “Thử tải 10 giây” cho biết trình duyệt có lấy được video từ EZVIZ để cắt highlight hay không.
      </PageHeader>
      <div className="space-y-3">
        {draft.cameras.map((c) => (
          <CameraRow key={c.id} camera={c} />
        ))}
      </div>
      <BrowserCard />
    </>
  );
}

function CameraRow({ camera }: { camera: Camera }) {
  const { draft } = useAdminDraft();
  const provider = getCameraProvider(camera, draft!);
  const problems = provider.configurationProblems(camera);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [live, setLive] = useState(false);
  const tables = draft!.tables.filter((t) => t.cameraId === camera.id);

  const check = async () => {
    setChecking(true);
    setStatus(await provider.checkStatus(camera).finally(() => setChecking(false)));
  };

  const tryFetch = async () => {
    setTesting(true);
    setTest(null);
    try {
      const end = Date.now() - 15_000;
      const rec = await provider.fetchRecording(camera, { startMs: end - 10_000, endMs: end }, () => undefined);
      const probe = await ffmpegService.probe(rec.blob, rec.fileName);
      setTest({
        ok: !!probe.videoCodec,
        text: `Nhận ${formatBytes(rec.blob.size)} (${rec.container.toUpperCase()}) · video ${describeCodec(probe.videoCodec)}${probe.width ? ` ${probe.width}×${probe.height}` : ""} · audio ${probe.audioCodec ?? "không có"}${rec.partial ? " · chỉ nhận một phần" : ""}`,
      });
    } catch (e) {
      const err = e instanceof AppError ? e : toAppError(e);
      setTest({ ok: false, text: `${err.message}${err.detail ? ` — ${err.detail}` : ""}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-semibold">{camera.name}</div>
        <ModeBadge mode={provider.mode} />
        <span className="text-xs text-faint">
          {camera.connection.provider === "ezviz" ? `${camera.connection.deviceSerial || "—"} / kênh ${camera.connection.channelNo}` : provider.label}
        </span>
        <div className="flex-1" />
        {status ? <HealthDot health={status.health} /> : checking ? <HealthDot health="checking" /> : null}
      </div>
      <div className="mt-1 text-xs text-faint">{tables.length ? `Bàn: ${tables.map((t) => t.name).join(", ")}` : "Chưa gắn bàn"}{!camera.enabled && " · đang tắt"}</div>
      {problems.length > 0 && (
        <Notice tone="warn" className="mt-3">
          {problems.join(" · ")}
        </Notice>
      )}
      {status && (
        <div className="mt-2 text-sm text-muted">
          {status.message} <span className="text-faint">({formatWallTime(status.checkedAt)})</span>
        </div>
      )}
      {test && (
        <Notice tone={test.ok ? "info" : "error"} title={test.ok ? "Tải được video. Cắt highlight hoạt động" : "Không tải được video"} className="mt-3">
          <span className="break-all">{test.text}</span>
        </Notice>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void check()} busy={checking}>
          Kiểm tra kết nối
        </Button>
        <Button size="sm" onClick={() => setLive((v) => !v)}>
          {live ? "Đóng xem trực tiếp" : "Xem trực tiếp"}
        </Button>
        {provider.mode === "REAL" && (
          <Button size="sm" onClick={() => void tryFetch()} busy={testing} disabled={problems.length > 0}>
            Thử tải 10 giây
          </Button>
        )}
      </div>
      {live && (
        <div className="mt-3 max-w-xl">
          <CameraView provider={provider} camera={camera} />
        </div>
      )}
    </Card>
  );
}

function BrowserCard() {
  const caps = getDeviceCapabilities();
  const [engine, setEngine] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rows: Array<[string, boolean | string, string]> = [
    ["HTTPS (secure context)", caps.secureContext, "Cần để mở camera quét QR, chia sẻ file"],
    ["WebAssembly", caps.webAssembly, "Bắt buộc cho ffmpeg.wasm"],
    ["Module Worker", caps.moduleWorker, "Bắt buộc cho ffmpeg.wasm"],
    ["IndexedDB", caps.indexedDb, "Lưu highlight, bản nháp"],
    ["Chia sẻ file (Web Share)", caps.shareFiles, "Lưu thẳng vào Ảnh trên iOS"],
    ["Phát H.264", caps.h264, ""],
    ["Phát H.265/HEVC", caps.hevc, "Nếu không có, video H.265 không xem trước được"],
    ["RAM thiết bị", caps.deviceMemoryGb ? `${caps.deviceMemoryGb} GB` : "không rõ", "Chỉ Chrome báo được"],
  ];
  const testEngine = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      await ffmpegService.load();
      setEngine(`Sẵn sàng sau ${((performance.now() - t0) / 1000).toFixed(1)} giây`);
    } catch (e) {
      setEngine(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Card className="mt-6 p-5">
      <h2 className="font-display text-2xl">Trình duyệt này</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v, hint]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
            <dt className="text-muted">
              {k}
              {hint && <span className="block text-xs text-faint">{hint}</span>}
            </dt>
            <dd className={typeof v === "boolean" ? (v ? "text-felt-bright" : "text-danger") : "text-chalk"}>{typeof v === "boolean" ? (v ? "Có" : "Không") : v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void testEngine()} busy={loading}>
          Thử khởi động ffmpeg.wasm
        </Button>
        {engine && <span className="text-sm text-muted">{engine}</span>}
      </div>
    </Card>
  );
}
