import { useState } from "react";
import { AppError } from "@/core/utils/errors";
import { useAdminDraft } from "@/features/admin/AdminDraftContext";
import { EzvizApi } from "@/features/camera/ezviz/ezvizApi";
import { Button, Card, Field, Notice } from "@/ui/kit";
import { PageHeader } from "./AdminLayout";

const REGIONS = [
  ["https://ivnopen.ezvizlife.com", "Việt Nam"],
  ["https://isgpopen.ezvizlife.com", "Singapore"],
  ["https://ieuopen.ezvizlife.com", "Châu Âu"],
  ["https://iusopen.ezvizlife.com", "Bắc Mỹ"],
  ["https://open.ys7.com", "Trung Quốc (萤石)"],
] as const;

const toLocalInput = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export function EzvizPage() {
  const { draft, update } = useAdminDraft();
  if (!draft) return null;
  const ez = draft.ezviz;
  const set = (patch: Partial<typeof ez>) => update((d) => ({ ...d, ezviz: { ...d.ezviz, ...patch } }));
  const isPreset = REGIONS.some(([v]) => v === ez.apiDomain);

  return (
    <>
      <PageHeader title="Tích hợp EZVIZ">
        Website không có máy chủ riêng, nên mọi thứ lưu ở đây đều sẽ <b>công khai</b> trong <code>venue.json</code>. Chỉ lưu thông tin được phép công khai.
      </PageHeader>

      <Card className="p-5">
        <h2 className="font-display text-2xl">Thông tin công khai</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Khu vực máy chủ (API domain)" hint="Theo khu vực của tài khoản EZVIZ. Token trả về “areaDomain” cho biết khu vực đúng.">
            <select className="field" value={isPreset ? ez.apiDomain : "custom"} onChange={(e) => e.target.value !== "custom" && set({ apiDomain: e.target.value })}>
              {REGIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l} — {v.replace("https://", "")}
                </option>
              ))}
              <option value="custom">Khác…</option>
            </select>
            {!isPreset && <input className="field mt-2" value={ez.apiDomain} onChange={(e) => set({ apiDomain: e.target.value.trim() })} />}
          </Field>
          <Field label="ezopen host" hint="Phần host trong ezopen://HOST/SERIAL/1.live. Mặc định open.ys7.com.">
            <input className="field font-mono" value={ez.ezopenHost} onChange={(e) => set({ ezopenHost: e.target.value.trim() })} />
          </Field>
          <Field label="Nguồn ghi hình">
            <select className="field" value={ez.recordingType} onChange={(e) => set({ recordingType: Number(e.target.value) === 3 ? 3 : 2 })}>
              <option value={2}>Thẻ nhớ SD trong camera</option>
              <option value={3}>Lưu trữ đám mây EZVIZ (CloudPlay)</option>
            </select>
          </Field>
          <Field label="Viewer token hết hạn lúc" hint="Lấy từ “expireTime” khi cấp token.">
            <input
              type="datetime-local"
              className="field"
              value={toLocalInput(ez.viewerTokenExpiresAt)}
              onChange={(e) => set({ viewerTokenExpiresAt: e.target.value ? new Date(e.target.value).getTime() : null })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Viewer token (CÔNG KHAI)" hint="Bắt buộc là token của tài khoản phụ (RAM) chỉ có quyền xem các camera của quán. Không dùng token của tài khoản chính.">
              <textarea className="field min-h-20 font-mono text-sm" value={ez.viewerToken} onChange={(e) => set({ viewerToken: e.target.value.trim() })} spellCheck={false} />
            </Field>
          </div>
        </div>
      </Card>

      <TokenTool apiDomain={ez.apiDomain} onUse={(token, exp) => set({ viewerToken: token, viewerTokenExpiresAt: exp })} />

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl">Yêu cầu trên camera</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>
            <b className="text-chalk">Tắt “Mã hoá video / Image encryption”</b> trong ứng dụng EZVIZ. Camera mã hoá cần verification code để giải mã, mà mã này không được phép đưa lên website công khai.
          </li>
          <li>
            Đặt mã hoá video là <b className="text-chalk">H.264</b> nếu camera cho phép. Một số trình duyệt (Chrome trên máy tính, nhiều điện thoại Android) không phát được H.265.
          </li>
          <li>Lắp thẻ nhớ, bật ghi hình liên tục. Nên đặt khoảng cách khung hình chính (I-frame) khoảng 1–2 giây để “Cắt nhanh” chính xác hơn.</li>
          <li>Đồng bộ giờ camera đúng múi giờ Việt Nam, vì khách chọn đoạn ghi hình theo giờ trên điện thoại.</li>
        </ul>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-2xl">Cái gì chạy được khi không có máy chủ</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th className="py-2 pr-4 font-medium">Chức năng</th>
                <th className="py-2 pr-4 font-medium">Cách làm</th>
                <th className="py-2 font-medium">Mức độ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-muted">
              {[
                ["Xem trực tiếp", "EZUIKit-JS (thư viện chính thức) phát ezopen://…/1.hd.live", "Chính thức"],
                ["Xem lại thẻ nhớ", "EZUIKit-JS với ezopen://…/1.rec?begin&end", "Chính thức"],
                ["Danh sách đoạn ghi", "API /api/lapp/video/by/time", "Theo tài liệu, cần thử trên thiết bị"],
                ["Tải đoạn ghi về trình duyệt", "API v2 live/address (type=2, protocol=FLV), tải bằng fetch rồi ffmpeg.wasm chuyển sang MP4", "Thử nghiệm: phụ thuộc CORS của máy chủ EZVIZ"],
                ["Ghi từ EZUIKit (startSave)", "Không dùng: file tạo ra cần trình phát riêng của EZVIZ, không phải MP4", "Không phù hợp"],
                ["Cấp / làm mới token", "Cần appSecret, nên chỉ làm thủ công trên máy quản trị", "Thủ công, định kỳ"],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td className="py-2 pr-4 text-chalk">{a}</td>
                  <td className="py-2 pr-4">{b}</td>
                  <td className="py-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/**
 * Runs in the admin's browser only. appKey/appSecret stay in component state (memory) and are
 * cleared on unmount — never written to IndexedDB, localStorage or venue.json.
 */
function TokenTool({ apiDomain, onUse }: { apiDomain: string; onUse(token: string, expiresAt: number | null): void }) {
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [mainToken, setMainToken] = useState<{ token: string; exp: number; area?: string } | null>(null);
  const [accountId, setAccountId] = useState("");
  const [sub, setSub] = useState<{ token: string; exp: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const a = e instanceof AppError ? e : null;
      setErr(a ? `${a.message}${a.detail ? ` — ${a.detail}` : ""}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  const getMain = () =>
    call(async () => {
      const r = await new EzvizApi(apiDomain).requestAccessToken(appKey.trim(), appSecret.trim());
      setAppSecret("");
      setMainToken({ token: r.accessToken, exp: r.expireTime, area: r.areaDomain });
    });

  const getSub = () =>
    call(async () => {
      if (!mainToken) return;
      const r = await new EzvizApi(mainToken.area || apiDomain).requestSubAccountToken(mainToken.token, accountId.trim());
      setSub({ token: r.accessToken, exp: r.expireTime });
    });

  return (
    <Card className="mt-4 p-5">
      <h2 className="font-display text-2xl">Công cụ cấp viewer token</h2>
      <p className="mt-1 text-sm text-muted">
        Chạy ngay trên trình duyệt quản trị. appSecret chỉ nằm trong bộ nhớ trang này và bị xoá sau khi gửi, không được lưu hay xuất bản. Nếu trình duyệt bị chặn (CORS), dùng lệnh curl bên dưới.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="appKey">
          <input className="field font-mono" value={appKey} onChange={(e) => setAppKey(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="appSecret (không lưu)">
          <input className="field font-mono" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button onClick={() => void getMain()} busy={busy} disabled={!appKey || !appSecret}>
          1. Lấy token chính
        </Button>
      </div>
      {mainToken && (
        <Notice tone="warn" title="Đã có token tài khoản chính" className="mt-3">
          Token này có toàn quyền với tài khoản, <b>không được</b> dán vào viewer token. Hết hạn: {new Date(mainToken.exp).toLocaleString("vi-VN")}
          {mainToken.area && ` · Khu vực: ${mainToken.area}`}
        </Notice>
      )}
      {mainToken && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="accountId của tài khoản phụ (RAM)" hint="Tạo tài khoản phụ và gán chính sách chỉ cho phép xem các camera của quán trên console EZVIZ Open Platform.">
            <input className="field font-mono" value={accountId} onChange={(e) => setAccountId(e.target.value)} spellCheck={false} />
          </Field>
          <Button onClick={() => void getSub()} busy={busy} disabled={!accountId}>
            2. Lấy token tài khoản phụ
          </Button>
        </div>
      )}
      {sub && (
        <div className="mt-3 rounded-xl border border-felt-bright/40 bg-felt/10 p-3 text-sm">
          <div className="break-all font-mono text-xs text-muted">{sub.token}</div>
          <div className="mt-1 text-xs text-faint">Hết hạn: {new Date(sub.exp).toLocaleString("vi-VN")}</div>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => onUse(sub.token, sub.exp)}>
            Dùng làm viewer token
          </Button>
        </div>
      )}
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}
      <details className="mt-4 text-sm text-muted">
        <summary className="cursor-pointer text-chalk">Lệnh curl tương đương (chạy trên máy quản trị)</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 text-xs">{`curl -X POST ${apiDomain}/api/lapp/token/get \\
  -d "appKey=<APP_KEY>&appSecret=<APP_SECRET>"

curl -X POST ${apiDomain}/api/lapp/ram/token/get \\
  -d "accessToken=<MAIN_TOKEN>&accountId=<RAM_ACCOUNT_ID>"`}</pre>
      </details>
    </Card>
  );
}
