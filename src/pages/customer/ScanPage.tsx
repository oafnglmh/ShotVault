import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseTableFromScan } from "@/features/qr/qrService";
import { QrScanner } from "@/features/qr/QrScanner";
import { IconQr } from "@/ui/icons";
import { Button, Notice } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";

/** Customer screen 1 — scan the QR on the table. There is deliberately no table list here. */
export function ScanPage() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [badCode, setBadCode] = useState(false);

  const onResult = (text: string) => {
    const id = parseTableFromScan(text);
    if (id) navigate(`/play/${id}`);
    else {
      setBadCode(true);
      setScanning(false);
    }
  };

  return (
    <CustomerLayout>
      <section className="pt-4">
        <div className="eyebrow">Highlight tại bàn</div>
        <h1 className="mt-3 font-display text-[44px] font-semibold leading-[1.02]">
          Lưu lại
          <br />
          cú đánh đẹp nhất.
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
          Quét mã QR dán trên bàn để mở camera của bàn, chọn đoạn vừa đánh và tải video về điện thoại. Không cần đăng nhập, không cần cài ứng dụng.
        </p>
      </section>

      <section className="mt-8">
        {scanning ? (
          <div className="space-y-3">
            <QrScanner onResult={onResult} />
            <Button variant="ghost" size="lg" onClick={() => setScanning(false)}>
              Đóng camera
            </Button>
          </div>
        ) : (
          <Button variant="primary" size="lg" onClick={() => (setBadCode(false), setScanning(true))}>
            <IconQr /> Quét mã QR trên bàn
          </Button>
        )}
        {badCode && (
          <Notice tone="warn" title="Mã QR không đúng" className="mt-4">
            Mã vừa quét không phải mã bàn của quán. Hãy quét mã dán trên bàn bida.
          </Notice>
        )}
      </section>

      <ol className="mt-10 space-y-5 border-t border-line pt-6">
        {[
          ["Quét mã", "Website tự nhận đúng bàn và camera của bạn."],
          ["Chọn đoạn", "Lấy lại vài phút vừa qua, kéo chọn điểm đầu và cuối."],
          ["Tải về", "Xuất MP4 ngay trên điện thoại và lưu vào thư viện."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="font-display text-2xl leading-none text-brass">{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="text-sm text-muted">{d}</div>
            </div>
          </li>
        ))}
      </ol>
    </CustomerLayout>
  );
}
