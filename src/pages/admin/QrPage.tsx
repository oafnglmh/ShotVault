import { useEffect, useState } from "react";
import type { BilliardTable } from "@/core/domain/types";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { downloadBlob, qrDataUrl, renderTableCard, tableUrl } from "@/features/qr/qrService";
import { safeFileName } from "@/core/utils/ids";
import { Button, Card, Notice } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

export function QrPage() {
  const { draft } = useAdminDraft();
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    let alive = true;
    void Promise.all(draft.tables.map(async (t) => [t.id, await qrDataUrl(tableUrl(draft, t.id), 480)] as const)).then(
      (pairs) => alive && setCodes(Object.fromEntries(pairs)),
    );
    return () => {
      alive = false;
    };
  }, [draft]);

  if (!draft) return null;
  const usingCurrentOrigin = !draft.publicBaseUrl;
  const isLocal = /localhost|127\.0\.0\.1|192\.168\.|10\./.test(draft.publicBaseUrl || window.location.origin);

  const downloadCard = async (t: BilliardTable) => {
    setBusy(t.id);
    try {
      downloadBlob(await renderTableCard(draft, t), `QR_${safeFileName(t.name)}.png`);
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    for (const t of draft.tables.filter((x) => x.active)) await downloadCard(t);
  };

  return (
    <>
      <PageHeader
        title="Mã QR"
        actions={
          <>
            <Button onClick={() => window.print()}>In tất cả</Button>
            <Button variant="primary" onClick={() => void downloadAll()} busy={!!busy}>
              Tải tất cả (PNG)
            </Button>
          </>
        }
      >
        Mỗi mã QR mở đúng trang của bàn: <code>{(draft.publicBaseUrl || window.location.origin) + "/play/<MÃ_BÀN>"}</code>. Mã QR chỉ cho biết khách đang ở bàn nào, không có tác dụng bảo mật: ai có đường dẫn đều mở được trang.
      </PageHeader>

      {(usingCurrentOrigin || isLocal) && (
        <Notice tone={isLocal ? "warn" : "info"} title={isLocal ? "QR đang trỏ tới địa chỉ nội bộ" : "QR dùng địa chỉ hiện tại"} className="no-print mb-5">
          {isLocal
            ? "Điện thoại của khách không mở được địa chỉ này. Hãy đặt “Địa chỉ website công khai” ở trang Tổng quan trước khi in."
            : `Mã QR đang dùng ${window.location.origin}. Nếu website có tên miền riêng, hãy đặt nó ở trang Tổng quan.`}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {draft.tables.map((t) => (
          <Card key={t.id} className="print-sheet flex flex-col items-center p-5 text-center">
            <div className="eyebrow">{draft.venueName}</div>
            <div className="mt-1 font-display text-3xl">{t.name}</div>
            <div className="mt-4 rounded-xl bg-white p-3">
              {codes[t.id] ? <img src={codes[t.id]} alt={`QR ${t.name}`} className="h-44 w-44" /> : <div className="h-44 w-44" />}
            </div>
            <div className="mt-3 break-all font-mono text-[11px] text-faint">{tableUrl(draft, t.id)}</div>
            {!t.active && <div className="mt-2 text-xs text-warn">Bàn đang tạm ngưng</div>}
            {!t.cameraId && <div className="mt-2 text-xs text-warn">Chưa gán camera</div>}
            <div className="no-print mt-4 flex gap-2">
              <Button size="sm" onClick={() => void downloadCard(t)} busy={busy === t.id}>
                Tải thẻ in
              </Button>
              <a className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-muted hover:text-chalk" href={tableUrl(draft, t.id)} target="_blank" rel="noreferrer">
                Mở thử
              </a>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
