import { useNavigate, useParams } from "react-router-dom";
import { formatBytes, formatClock, formatDateTime } from "@/core/utils/time";
import { deleteHighlight } from "@/features/highlights/highlightRepository";
import { getVideoSource } from "@/features/highlights/sourceStore";
import { IconDownload, IconScissors, IconTrash } from "@/ui/icons";
import { Button, EmptyState, LinkButton, ModeBadge, Spinner } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";
import { useHighlight } from "./useHighlight";

/** Customer screen 6 — the finished highlight. */
export function ResultPage() {
  const { hid } = useParams();
  const { table, base } = useTableContext();
  const navigate = useNavigate();
  const { highlight, url } = useHighlight(hid, table.id);
  const canCutAgain = getVideoSource()?.tableId === table.id;

  if (highlight === undefined) {
    return (
      <CustomerLayout back={base}>
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      </CustomerLayout>
    );
  }
  if (!highlight || !url) {
    return (
      <CustomerLayout back={base}>
        <EmptyState title="Không tìm thấy highlight" action={<LinkButton to={base}>Về trang bàn</LinkButton>}>
          Highlight chỉ được lưu trên điện thoại đã tạo ra nó và tự xoá sau 3 ngày.
        </EmptyState>
      </CustomerLayout>
    );
  }

  const remove = async () => {
    if (!confirm("Xoá highlight này khỏi điện thoại?")) return;
    await deleteHighlight(highlight.id);
    navigate(base, { replace: true });
  };

  return (
    <CustomerLayout back={base} title={<span className="font-semibold">Highlight đã sẵn sàng</span>} right={<ModeBadge mode={highlight.mode} />} wide>
      <video src={url} className="aspect-video w-full rounded-xl border border-line bg-black" controls playsInline autoPlay muted loop />
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl">{table.name}</h1>
        <span className="text-sm text-muted">
          {formatDateTime(highlight.createdAt)} · {formatClock(highlight.durationSec)} · {formatBytes(highlight.sizeBytes)} · MP4
        </span>
      </div>
      <div className="mt-6 grid max-w-lg gap-3">
        <LinkButton to={`${base}/highlight/${highlight.id}/download`} variant="primary" size="lg">
          <IconDownload /> Tải về điện thoại
        </LinkButton>
        <LinkButton to={canCutAgain ? `${base}/editor` : `${base}/recordings`} size="lg">
          <IconScissors /> {canCutAgain ? "Cắt thêm đoạn khác" : "Tạo highlight mới"}
        </LinkButton>
        <Button variant="danger" onClick={() => void remove()}>
          <IconTrash /> Xoá
        </Button>
      </div>
    </CustomerLayout>
  );
}
