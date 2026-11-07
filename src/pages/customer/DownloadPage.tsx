import { useState } from "react";
import { useParams } from "react-router-dom";
import { getDeviceCapabilities } from "@/core/utils/device";
import { formatBytes } from "@/core/utils/time";
import { downloadBlob } from "@/features/qr/qrService";
import { IconCheck, IconDownload, IconShare } from "@/ui/icons";
import { Button, EmptyState, LinkButton, Notice, Spinner } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";
import { useHighlight } from "./useHighlight";

/**
 * Customer screen 7 — get the MP4 onto the phone.
 *  - iOS: Web Share sheet → "Lưu video" puts it straight into Photos (the <a download> path
 *    only reaches the Files app).
 *  - Android: <a download> saves to Downloads; share sheet also available.
 */
export function DownloadPage() {
  const { hid } = useParams();
  const { table, base } = useTableContext();
  const { highlight, url } = useHighlight(hid, table.id);
  const caps = getDeviceCapabilities();
  const [done, setDone] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

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
        <EmptyState title="Không tìm thấy highlight" action={<LinkButton to={base}>Về trang bàn</LinkButton>} />
      </CustomerLayout>
    );
  }

  const file = new File([highlight.blob], highlight.fileName, { type: "video/mp4" });

  const share = async () => {
    setShareError(null);
    try {
      await navigator.share({ files: [file], title: `Highlight ${table.name}` });
      setDone(caps.isIOS ? "Nếu bạn chọn “Lưu video”, video đã nằm trong ứng dụng Ảnh." : "Đã chia sẻ.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setShareError("Không mở được bảng chia sẻ. Hãy dùng nút Tải file MP4.");
    }
  };

  const download = () => {
    downloadBlob(highlight.blob, highlight.fileName);
    setDone(caps.isIOS ? "Video đã lưu vào ứng dụng Tệp (Files) → Tải về." : "Video đã lưu vào thư mục Tải xuống (Downloads).");
  };

  return (
    <CustomerLayout back={`${base}/highlight/${highlight.id}`} title={<span className="font-semibold">Tải video</span>}>
      <div className="rounded-2xl border border-line bg-panel p-5">
        <div className="eyebrow">{table.name}</div>
        <div className="mt-2 break-all font-medium">{highlight.fileName}</div>
        <div className="text-sm text-muted">MP4 · {formatBytes(highlight.sizeBytes)}</div>
      </div>

      <div className="mt-5 grid gap-3">
        {caps.shareFiles && (
          <Button variant="primary" size="lg" onClick={() => void share()}>
            <IconShare /> {caps.isIOS ? "Lưu vào Ảnh / Chia sẻ" : "Chia sẻ / Lưu"}
          </Button>
        )}
        <Button variant={caps.shareFiles ? "secondary" : "primary"} size="lg" onClick={download}>
          <IconDownload /> Tải file MP4
        </Button>
      </div>

      {done && (
        <Notice className="mt-5" title="Xong">
          <span className="inline-flex items-start gap-2">
            <IconCheck className="mt-0.5 shrink-0 text-felt-bright" /> {done}
          </span>
        </Notice>
      )}
      {shareError && <Notice tone="warn" className="mt-5">{shareError}</Notice>}

      <section className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-muted">
        <h2 className="mb-2 font-display text-xl text-chalk">Không tải được?</h2>
        {caps.isIOS ? (
          <ol className="list-decimal space-y-1 pl-5">
            <li>Bấm “Lưu vào Ảnh / Chia sẻ” rồi chọn “Lưu video”.</li>
            <li>Nếu dùng nút “Tải file MP4”, mở ứng dụng Tệp → Tải về, giữ video → Chia sẻ → Lưu video.</li>
            <li>Đang mở trong Zalo/Facebook? Bấm ••• → “Mở bằng Safari” rồi thử lại.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1 pl-5">
            <li>Bấm “Tải file MP4”, video sẽ ở thư mục Tải xuống và trong thư viện ảnh.</li>
            <li>Đang mở trong Zalo/Facebook? Mở bằng Chrome rồi thử lại.</li>
            <li>
              Hoặc{" "}
              <a href={url} target="_blank" rel="noreferrer" className="text-felt-bright underline">
                mở video trong tab mới
              </a>{" "}
              rồi bấm giữ để lưu.
            </li>
          </ol>
        )}
      </section>
    </CustomerLayout>
  );
}
