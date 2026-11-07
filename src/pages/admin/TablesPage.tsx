import { useState } from "react";
import { ID_PATTERN } from "@/core/config/venueSchema";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { IconTrash } from "@/ui/icons";
import { Button, Card, Field, Notice, TablePlaque } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function TablesPage() {
  const { draft, update } = useAdminDraft();
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!draft) return null;

  const add = () => {
    const id = newId.trim().toUpperCase();
    if (!ID_PATTERN.test(id)) return setError("Mã bàn chỉ gồm chữ in hoa, số, “_” hoặc “-”, 2–32 ký tự. Ví dụ TABLE_04.");
    if (draft.tables.some((t) => t.id === id)) return setError("Mã bàn đã tồn tại.");
    update((d) => ({ ...d, tables: [...d.tables, { id, name: newName.trim() || id, cameraId: null, active: true }] }));
    setNewId("");
    setNewName("");
    setError(null);
  };

  const nextSuggestion = `TABLE_${String(draft.tables.length + 1).padStart(2, "0")}`;

  return (
    <>
      <PageHeader title="Quản lý bàn">
        Mã bàn nằm trong mã QR (<code>/play/MÃ_BÀN</code>). Đổi mã bàn sẽ làm QR đã in không còn dùng được — hãy giữ cố định.
      </PageHeader>

      <div className="space-y-2">
        {draft.tables.map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center gap-4 p-4">
            <TablePlaque label={t.name} />
            <div className="min-w-[10rem] flex-1">
              <input
                className="field"
                value={t.name}
                aria-label="Tên bàn"
                onChange={(e) => update((d) => ({ ...d, tables: d.tables.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) }))}
              />
              <div className="mt-1 text-xs text-faint">
                {t.id} · {t.cameraId ? `Camera: ${draft.cameras.find((c) => c.id === t.cameraId)?.name ?? t.cameraId}` : "Chưa gán camera"}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--color-felt-bright)]"
                checked={t.active}
                onChange={(e) => update((d) => ({ ...d, tables: d.tables.map((x) => (x.id === t.id ? { ...x, active: e.target.checked } : x)) }))}
              />
              Hoạt động
            </label>
            <Button
              variant="danger"
              size="sm"
              aria-label={`Xoá ${t.name}`}
              onClick={() => confirm(`Xoá ${t.name}? QR đã in của bàn này sẽ báo "không tìm thấy bàn".`) && update((d) => ({ ...d, tables: d.tables.filter((x) => x.id !== t.id) }))}
            >
              <IconTrash />
            </Button>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-2xl">Thêm bàn</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Mã bàn">
            <input className="field uppercase" placeholder={nextSuggestion} value={newId} onChange={(e) => setNewId(e.target.value)} />
          </Field>
          <Field label="Tên hiển thị">
            <input className="field" placeholder="Bàn 04" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={add}>
            Thêm
          </Button>
        </div>
        {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      </Card>
    </>
  );
}
