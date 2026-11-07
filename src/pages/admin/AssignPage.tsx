import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { Card, ModeBadge, Notice, TablePlaque } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function AssignPage() {
  const { draft, update } = useAdminDraft();
  if (!draft) return null;

  const counts = new Map<string, number>();
  for (const t of draft.tables) if (t.cameraId) counts.set(t.cameraId, (counts.get(t.cameraId) ?? 0) + 1);
  const shared = [...counts.entries()].filter(([, n]) => n > 1);

  const assign = (tableId: string, cameraId: string | null) =>
    update((d) => ({ ...d, tables: d.tables.map((t) => (t.id === tableId ? { ...t, cameraId } : t)) }));

  return (
    <>
      <PageHeader title="Gán camera vào bàn">
        Khách quét QR của bàn nào sẽ chỉ thấy đúng camera được gán ở đây. Khách không thể tự đổi camera.
      </PageHeader>
      {shared.length > 0 && (
        <Notice tone="warn" title="Một camera đang gắn nhiều bàn" className="mb-4">
          {shared.map(([id, n]) => `${draft.cameras.find((c) => c.id === id)?.name ?? id} (${n} bàn)`).join(", ")}. Khách ở các bàn này sẽ xem cùng một hình ảnh.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {draft.tables.map((t) => {
          const cam = draft.cameras.find((c) => c.id === t.cameraId);
          return (
            <Card key={t.id} className="flex items-center gap-4 p-4">
              <TablePlaque label={t.name} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name}</div>
                <select className="field mt-2" value={t.cameraId ?? ""} onChange={(e) => assign(t.id, e.target.value || null)} aria-label={`Camera cho ${t.name}`}>
                  <option value="">— Chưa gán —</option>
                  {draft.cameras.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.enabled}>
                      {c.name} ({c.connection.provider === "ezviz" ? c.connection.deviceSerial || "chưa có serial" : "DEMO"})
                      {!c.enabled ? " — đang tắt" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {cam && <ModeBadge mode={cam.connection.provider === "mock" ? "DEMO" : "REAL"} />}
            </Card>
          );
        })}
      </div>
    </>
  );
}
