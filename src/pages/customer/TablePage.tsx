import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Highlight } from "@/core/domain/types";
import { formatBytes, formatClock, formatDateTime } from "@/core/utils/time";
import { useCameraStatus } from "@/features/camera/useCameraStatus";
import { listHighlights } from "@/features/highlights/highlightRepository";
import { IconCamera, IconFilm, IconScissors } from "@/ui/icons";
import { Card, HealthDot, LinkButton, ModeBadge, Notice, TablePlaque } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";

/** Customer screen 2 — the table "home": identity, camera status, main actions, my highlights. */
export function TablePage() {
  const { table, camera, provider, base, venue } = useTableContext();
  const { status, checking } = useCameraStatus(provider, camera);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const caps = provider.capabilities(camera);

  useEffect(() => {
    void listHighlights(table.id).then(setHighlights);
  }, [table.id]);

  const unavailable = status && (status.health === "offline" || status.health === "misconfigured");

  return (
    <CustomerLayout right={<ModeBadge mode={provider.mode} />}>
      <div className="flex items-center gap-4">
        <TablePlaque label={table.name} size="lg" />
        <div className="min-w-0">
          <div className="eyebrow">{venue.venueName}</div>
          <h1 className="font-display text-4xl font-semibold leading-tight">{table.name}</h1>
          <div className="mt-1">
            <HealthDot health={checking && !status ? "checking" : status?.health ?? "unknown"} />
          </div>
        </div>
      </div>

      {provider.mode === "DEMO" && (
        <Notice tone="demo" title="Đang chạy chế độ DEMO" className="mt-5">
          Bàn này dùng camera mô phỏng để thử tính năng. Video không phải hình ảnh thật từ camera của quán.
        </Notice>
      )}
      {unavailable && (
        <Notice tone="error" title="Camera chưa sẵn sàng" className="mt-5">
          {status?.message}. Bạn vẫn có thể cắt video có sẵn trong điện thoại.
        </Notice>
      )}

      <div className="mt-6 grid gap-3">
        <LinkButton to={`${base}/recordings`} variant="primary" size="lg">
          <IconScissors /> Tạo highlight
        </LinkButton>
        {caps.liveView && (
          <LinkButton to={`${base}/live`} variant="secondary" size="lg">
            <IconCamera /> Xem camera trực tiếp
          </LinkButton>
        )}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Highlight của bạn</h2>
          <span className="text-xs text-faint">Lưu trên điện thoại này</span>
        </div>
        {highlights.length === 0 ? (
          <Card className="px-4 py-6 text-center text-sm text-muted">Chưa có highlight nào. Bấm “Tạo highlight” để bắt đầu.</Card>
        ) : (
          <ul className="space-y-2">
            {highlights.map((h) => (
              <li key={h.id}>
                <Link to={`${base}/highlight/${h.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 hover:border-line-strong">
                  <IconFilm className="shrink-0 text-felt-bright" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{formatDateTime(h.createdAt)} · {formatClock(h.durationSec)}</div>
                    <div className="truncate text-xs text-faint">{h.sourceLabel} · {formatBytes(h.sizeBytes)}</div>
                  </div>
                  {h.mode === "DEMO" && <ModeBadge mode="DEMO" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CustomerLayout>
  );
}
