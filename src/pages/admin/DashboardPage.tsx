import { useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useVenue } from "@/app/VenueContext";
import { isDraftPreviewEnabled, setDraftPreviewEnabled } from "@/core/config/configRepository";
import { findSecretLeaks } from "@/core/config/venueSchema";
import { downloadBlob } from "@/features/qr/qrService";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { Button, Card, Field, Notice } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function DashboardPage() {
  const { draft, published, publishedError, dirtyVsPublished, exportJson, importJson, discardDraft, update } = useAdminDraft();
  const { reload } = useVenue();
  const [preview, setPreview] = useState(isDraftPreviewEnabled());
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!draft) return null;

  const demoCams = draft.cameras.filter((c) => c.connection.provider === "mock").length;
  const realCams = draft.cameras.length - demoCams;
  const unassigned = draft.tables.filter((t) => !t.cameraId).length;
  const tokenExpiry = draft.ezviz.viewerTokenExpiresAt;
  const tokenDaysLeft = tokenExpiry ? Math.floor((tokenExpiry - Date.now()) / 86_400_000) : null;
  const leaks = findSecretLeaks(draft);

  const doExport = () => {
    if (leaks.length) return;
    downloadBlob(new Blob([exportJson()], { type: "application/json" }), "venue.json");
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await importJson(await f.text());
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePreview = async () => {
    setDraftPreviewEnabled(!preview);
    setPreview(!preview);
    await reload();
  };

  return (
    <>
      <PageHeader title="Tổng quan">
        Mọi chỉnh sửa được lưu thành <b>bản nháp trên trình duyệt này</b>. Khách hàng chỉ thấy thay đổi sau khi bạn xuất <code>venue.json</code> và triển khai lại website.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Bàn", draft.tables.length, `${draft.tables.filter((t) => t.active).length} đang hoạt động`],
          ["Camera", draft.cameras.length, `${realCams} thật · ${demoCams} mô phỏng`],
          ["Chưa gán camera", unassigned, unassigned ? "Cần gán trước khi in QR" : "Đã gán đủ"],
          ["Viewer token", tokenDaysLeft === null ? "—" : tokenDaysLeft < 0 ? "Hết hạn" : `${tokenDaysLeft} ngày`, draft.ezviz.viewerToken ? "Token EZVIZ công khai" : "Chưa cấu hình"],
        ].map(([label, value, sub]) => (
          <Card key={String(label)} className="p-4">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-1 font-display text-3xl">{value}</div>
            <div className="text-xs text-faint">{sub}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {demoCams > 0 && (
          <Notice tone="demo" title={`${demoCams} camera đang ở chế độ DEMO`}>
            Khách quét QR của các bàn này sẽ thấy nhãn DEMO và video mô phỏng. Vào <Link className="underline" to="/admin/cameras">Camera</Link> để chuyển sang EZVIZ khi đã có thiết bị.
          </Notice>
        )}
        {realCams > 0 && !draft.ezviz.viewerToken && (
          <Notice tone="warn" title="Camera EZVIZ chưa có quyền xem">
            Vào <Link className="underline" to="/admin/ezviz">EZVIZ</Link> để cấu hình viewer token.
          </Notice>
        )}
        {tokenDaysLeft !== null && tokenDaysLeft < 2 && (
          <Notice tone="warn" title="Viewer token sắp hết hạn">
            Token EZVIZ có hạn dùng. Hãy cấp token mới, xuất lại venue.json và triển khai lại trước khi hết hạn.
          </Notice>
        )}
        {publishedError && (
          <Notice tone="warn" title="Không đọc được cấu hình đã xuất bản">
            {publishedError}
          </Notice>
        )}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-2xl">Xuất bản cấu hình</h2>
        <div className="mt-1 text-sm text-muted">
          {published
            ? dirtyVsPublished
              ? "Bản nháp khác với cấu hình đang chạy trên website."
              : "Bản nháp trùng với cấu hình đang chạy."
            : "Website chưa có cấu hình xuất bản (đang dùng cấu hình mặc định)."}
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Bấm “Tải venue.json”.</li>
          <li>
            Thay file <code className="text-chalk">public/config/venue.json</code> trong mã nguồn (hoặc kéo thả vào thư mục <code className="text-chalk">config/</code> trên hosting).
          </li>
          <li>Triển khai lại (Vercel/Netlify tự build khi push). Khách sẽ thấy thay đổi ngay sau đó.</li>
        </ol>
        {leaks.length > 0 && (
          <Notice tone="error" title="Phát hiện dữ liệu bí mật" className="mt-4">
            Cấu hình chứa “{leaks.join(", ")}”. Không thể xuất bản bí mật lên website công khai.
          </Notice>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={doExport} disabled={leaks.length > 0}>
            Tải venue.json
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onImport(e)} />
          <Button onClick={() => fileRef.current?.click()}>Nhập từ file</Button>
          <Button variant="ghost" onClick={() => confirm("Bỏ bản nháp và tải lại cấu hình đang chạy?") && void discardDraft()}>
            Bỏ bản nháp
          </Button>
        </div>
        {importError && <Notice tone="error" className="mt-3">{importError}</Notice>}
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Xem trước bản nháp</h2>
            <p className="text-sm text-muted">Chỉ trên trình duyệt này: trang khách (/play/…) sẽ dùng bản nháp thay vì cấu hình đã xuất bản.</p>
          </div>
          <Button variant={preview ? "primary" : "secondary"} onClick={() => void togglePreview()}>
            {preview ? "Đang bật — Tắt" : "Bật xem trước"}
          </Button>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl">Thông tin quán</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Tên quán">
            <input className="field" value={draft.venueName} onChange={(e) => update((d) => ({ ...d, venueName: e.target.value }))} />
          </Field>
          <Field label="Địa chỉ website công khai" hint="Dùng để tạo mã QR. Để trống = địa chỉ hiện tại.">
            <input
              className="field"
              placeholder={window.location.origin}
              value={draft.publicBaseUrl}
              onChange={(e) => update((d) => ({ ...d, publicBaseUrl: e.target.value.trim() }))}
            />
          </Field>
          <Field label="Highlight dài tối đa (giây)">
            <input
              type="number"
              className="field"
              min={5}
              max={600}
              value={draft.limits.maxClipSeconds}
              onChange={(e) => update((d) => ({ ...d, limits: { ...d.limits, maxClipSeconds: Number(e.target.value) || 5 } }))}
            />
          </Field>
          <Field label="Cắt chính xác tối đa (giây)" hint="Mã hoá lại trên điện thoại rất tốn CPU/RAM.">
            <input
              type="number"
              className="field"
              min={5}
              max={180}
              value={draft.limits.maxPreciseSeconds}
              onChange={(e) => update((d) => ({ ...d, limits: { ...d.limits, maxPreciseSeconds: Number(e.target.value) || 5 } }))}
            />
          </Field>
        </div>
      </Card>
    </>
  );
}
