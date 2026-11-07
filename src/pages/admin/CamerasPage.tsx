import { useState } from "react";
import { ID_PATTERN } from "@/core/config/venueSchema";
import type { Camera, CameraConnection } from "@/core/domain/types";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { PROVIDER_OPTIONS } from "@/features/camera/providerRegistry";
import { IconTrash } from "@/ui/icons";
import { Button, Card, Field, ModeBadge, Notice } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function CamerasPage() {
  const { draft, update } = useAdminDraft();
  const [newId, setNewId] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!draft) return null;

  const patch = (id: string, fn: (c: Camera) => Camera) =>
    update((d) => ({ ...d, cameras: d.cameras.map((c) => (c.id === id ? fn(c) : c)) }));

  const setProvider = (cam: Camera, provider: string) => {
    const connection: CameraConnection =
      provider === "ezviz" ? { provider: "ezviz", deviceSerial: "", channelNo: 1 } : { provider: "mock" };
    patch(cam.id, (c) => ({ ...c, connection }));
  };

  const add = () => {
    const id = newId.trim().toUpperCase();
    if (!ID_PATTERN.test(id)) return setError("Mã camera chỉ gồm chữ in hoa, số, “_” hoặc “-”. Ví dụ CAM_04.");
    if (draft.cameras.some((c) => c.id === id)) return setError("Mã camera đã tồn tại.");
    update((d) => ({ ...d, cameras: [...d.cameras, { id, name: id, connection: { provider: "mock" }, enabled: true }] }));
    setNewId("");
    setError(null);
  };

  return (
    <>
      <PageHeader title="Quản lý camera">
        Mỗi camera là mô phỏng (DEMO) hoặc EZVIZ (REAL). Ở đây chỉ lưu thông tin công khai như serial và kênh. Không nhập mật khẩu hay mã xác minh (verification code) của camera.
      </PageHeader>

      <div className="space-y-3">
        {draft.cameras.map((cam) => {
          const usedBy = draft.tables.filter((t) => t.cameraId === cam.id);
          const conn = cam.connection;
          return (
            <Card key={cam.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-mono text-sm text-faint">{cam.id}</div>
                <ModeBadge mode={conn.provider === "mock" ? "DEMO" : "REAL"} />
                <div className="flex-1" />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--color-felt-bright)]"
                    checked={cam.enabled}
                    onChange={(e) => patch(cam.id, (c) => ({ ...c, enabled: e.target.checked }))}
                  />
                  Bật
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Xoá ${cam.name}`}
                  onClick={() =>
                    confirm(`Xoá ${cam.name}?${usedBy.length ? ` Bàn ${usedBy.map((t) => t.name).join(", ")} sẽ mất camera.` : ""}`) &&
                    update((d) => ({
                      ...d,
                      cameras: d.cameras.filter((c) => c.id !== cam.id),
                      tables: d.tables.map((t) => (t.cameraId === cam.id ? { ...t, cameraId: null } : t)),
                    }))
                  }
                >
                  <IconTrash />
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Tên camera">
                  <input className="field" value={cam.name} onChange={(e) => patch(cam.id, (c) => ({ ...c, name: e.target.value }))} />
                </Field>
                <Field label="Model (tuỳ chọn)">
                  <input className="field" placeholder="EZVIZ C6N / H8c…" value={cam.model ?? ""} onChange={(e) => patch(cam.id, (c) => ({ ...c, model: e.target.value || undefined }))} />
                </Field>
                <Field label="Loại kết nối">
                  <select className="field" value={conn.provider} onChange={(e) => setProvider(cam, e.target.value)}>
                    {PROVIDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {conn.provider === "ezviz" && (
                  <>
                    <Field label="Serial thiết bị" hint="9 ký tự in trên nhãn camera / trong ứng dụng EZVIZ.">
                      <input
                        className="field font-mono uppercase"
                        value={conn.deviceSerial}
                        onChange={(e) => patch(cam.id, (c) => ({ ...c, connection: { ...conn, deviceSerial: e.target.value.trim().toUpperCase() } }))}
                      />
                    </Field>
                    <Field label="Kênh (channel)" hint="Camera đơn thường là 1.">
                      <input
                        type="number"
                        min={1}
                        className="field"
                        value={conn.channelNo}
                        onChange={(e) => patch(cam.id, (c) => ({ ...c, connection: { ...conn, channelNo: Math.max(1, Number(e.target.value) || 1) } }))}
                      />
                    </Field>
                  </>
                )}
                {conn.provider === "mock" && (
                  <Field label="Video mẫu tĩnh (tuỳ chọn)" hint="Đường dẫn file đặt trong public/demo/, ví dụ /demo/ban01.mp4">
                    <input
                      className="field"
                      placeholder="/demo/ban01.mp4"
                      value={conn.demoClipUrl ?? ""}
                      onChange={(e) => patch(cam.id, (c) => ({ ...c, connection: { provider: "mock", demoClipUrl: e.target.value.trim() || undefined } }))}
                    />
                  </Field>
                )}
              </div>
              <div className="mt-2 text-xs text-faint">
                {usedBy.length ? `Đang gắn: ${usedBy.map((t) => t.name).join(", ")}` : "Chưa gắn với bàn nào"}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-2xl">Thêm camera</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Field label="Mã camera">
              <input className="field uppercase" placeholder={`CAM_${String(draft.cameras.length + 1).padStart(2, "0")}`} value={newId} onChange={(e) => setNewId(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" onClick={add}>
            Thêm
          </Button>
        </div>
        {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      </Card>
    </>
  );
}
