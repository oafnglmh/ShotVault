# Billiards Highlight

Website **chỉ có frontend** (static) cho quán bida. Khách quét QR trên bàn, website tự nhận bàn và camera, khách tự chọn đoạn video, cắt highlight thành MP4 ngay trên điện thoại rồi tải về. Không có backend, database server hay máy chủ xử lý video.

- Stack: React 18, TypeScript, Vite 6, Tailwind 4, React Router 6, ffmpeg.wasm 0.12 (single-thread), IndexedDB (`idb`), `qrcode`, `jsqr`, EZUIKit-JS (SDK web chính thức của EZVIZ, chỉ tải khi có camera thật).
- Deploy: Vercel / Netlify / bất kỳ static host nào (`vercel.json`, `netlify.toml`, `public/_redirects` đã có sẵn).

```bash
npm install
npm run dev        # http://localhost:5173  (admin: /admin, khách: /play/TABLE_01)
npm test           # unit test cho logic thuần
npm run build      # xuất ra dist/
```

## Trạng thái

| Phần | Trạng thái |
|---|---|
| QR → bàn → camera, quản lý bàn/camera/gán, tạo & in QR | Xong |
| Trình phát, timeline cắt (chính xác 0.1s), xem thử lặp đoạn | Xong |
| Cắt bằng ffmpeg.wasm (Cắt nhanh = stream copy, Cắt chính xác = H.264), xuất MP4, tải/Share | Xong. Đã kiểm thử tự động trên Chromium (Pixel 7) và WebKit (iPhone 13) |
| Chế độ DEMO (camera mô phỏng, tạo video mẫu ngay trên máy) | Xong, luôn gắn nhãn **DEMO** |
| EZVIZ: xem trực tiếp / xem lại thẻ nhớ (EZUIKit) | Đã code theo tài liệu chính thức, **chưa chạy với camera thật** |
| EZVIZ: tải đoạn ghi về trình duyệt để cắt | Đã code, **thử nghiệm**: phụ thuộc CORS của máy chủ EZVIZ (xem bên dưới) |

Kiểm tra trên điện thoại thật: chạy `npm run dev`, mở `http://<IP-máy>:5173/play/TABLE_01`. Quét QR trên điện thoại cần HTTPS, nên hãy deploy lên Vercel hoặc dùng tunnel HTTPS.

## Nghiên cứu EZVIZ & giới hạn của kiến trúc frontend-only

| Việc | Cách EZVIZ cung cấp | Chạy được thuần trình duyệt? |
|---|---|---|
| Xác thực | `POST /api/lapp/token/get` với **appKey + appSecret** → accessToken (có hạn) | appSecret **không được** nằm trong frontend. Chỉ admin tự cấp thủ công |
| Xem trực tiếp | EZUIKit-JS phát `ezopen://host/SERIAL/1.hd.live` (giải mã bằng wasm) | Có, với accessToken |
| Xem lại thẻ nhớ / cloud | EZUIKit-JS `…/1.rec?begin=YYYYMMDDHHmmss&end=…` (`.cloud.rec` cho cloud) | Có, chỉ để xem |
| Danh sách đoạn ghi | `/api/lapp/video/by/time` | Có thể (cần thử trên thiết bị) |
| Lấy byte video để cắt | `/api/lapp/v2/live/address/get` `type=2` (SD) / `3` (cloud), `protocol=4` (FLV). Theo tài liệu, phát lại không hỗ trợ HLS | Chỉ khi máy chủ stream EZVIZ trả header CORS. EZVIZ không công bố điều này nên phải kiểm tra |
| Ghi từ trình phát (`startSave`) | Tạo file cần trình phát riêng của EZVIZ | Không dùng được để xuất MP4 |
| RTSP / ONVIF | Giao thức TCP trong mạng LAN | Trình duyệt không mở được, **không dùng** |
| Camera bật mã hoá video | Cần verification code để giải mã | Mã này là bí mật nên không đưa lên web. Phải **tắt mã hoá** trên camera |

### Vấn đề token (giới hạn quan trọng nhất)

Không có server thì không thể cấp token an toàn cho từng khách. Phương án gần nhất vẫn giữ ràng buộc không có backend:

1. Trên console EZVIZ Open Platform, tạo **tài khoản phụ (RAM)** có chính sách *chỉ xem* đúng các camera của quán.
2. Admin vào `/admin/ezviz` và dùng công cụ cấp token, chạy trên trình duyệt admin. appSecret chỉ nằm trong bộ nhớ và không được lưu. Nếu trình duyệt bị CORS chặn thì dùng lệnh curl có sẵn trên trang. Kết quả là token của tài khoản phụ.
3. Token này là **public có chủ đích**, được ghi vào `venue.json`. Rủi ro tối đa là người ngoài xem được camera bàn bida. Họ không điều khiển được thiết bị và không truy cập được tài khoản.
4. Token có hạn. Trước khi hết hạn, admin cấp token mới, xuất lại `venue.json` rồi deploy lại. Trang Tổng quan sẽ cảnh báo khi token sắp hết hạn.

Muốn tự động làm mới token, hoặc cấp token riêng theo từng phiên khách, thì cần một máy chủ (dù chỉ là 1 serverless function). Phần này nằm ngoài phạm vi theo yêu cầu.

### Vì sao QR không phải bảo mật

QR chỉ chứa `/play/TABLE_xx`, ai biết đường dẫn đều mở được. Giao diện không cho khách đổi sang camera bàn khác (không có danh sách bàn, không có ô nhập mã), nhưng đó không phải kiểm soát truy cập. Lớp bảo vệ thật là quyền hạn hẹp của token tài khoản phụ.

## Cấu hình (frontend-only)

- Cấu hình **đã xuất bản**: `public/config/venue.json`. Mọi điện thoại khách đều đọc file này.
- Admin (`/admin`) sửa **bản nháp** trong IndexedDB của trình duyệt admin, rồi bấm **Tải venue.json**, thay file và deploy lại. Có nút “Xem trước bản nháp” để thử trên chính máy admin.
- Trước khi xuất, app chặn những gì giống bí mật (`appSecret`, `password`, `validCode`…). Validator cũng loại bỏ mọi trường lạ.
- Trang `/admin` không có đăng nhập vì không có server để xác thực. Trang này cũng không giữ quyền gì: nó chỉ tạo file cấu hình, và thay đổi chỉ có hiệu lực khi có người deploy.

## Xử lý video trên trình duyệt

- **ffmpeg.wasm single-thread**: không cần SharedArrayBuffer hay COOP/COEP nên chạy trên iOS Safari và mọi static host. Wasm nặng khoảng 32 MB (khoảng 10 MB sau gzip), chỉ tải ở lần cắt đầu và có thanh tiến trình.
- Video nguồn được **mount bằng WORKERFS**: ffmpeg đọc dần từ File/Blob, không chép toàn bộ vào bộ nhớ wasm.
- **Cắt nhanh** (`-c copy`): mất vài giây, không giảm chất lượng, bắt đầu từ keyframe gần nhất. **Cắt chính xác** (libx264 ultrafast): chính xác từng khung hình, giới hạn 45 giây (30 giây trên máy yếu/iOS).
- Âm thanh G.711 của camera được chuyển sang AAC. HEVC giữ nguyên và gắn tag `hvc1` để thiết bị Apple phát được.
- Các trường hợp lỗi đã xử lý:
  - Video quá dài: giới hạn có thể cấu hình.
  - Thiếu RAM: `processingBudget()`; khi OOM thì khởi động lại worker và gợi ý chọn đoạn ngắn hơn.
  - Codec trình duyệt không phát được (ví dụ H.265 trên Chrome desktop): dùng ffprobe để vẫn cắt được, có thông báo rõ ràng.
  - Không lấy được video từ camera (CORS hoặc offline): lỗi có mã riêng và gợi ý cách khác.
  - Cắt nhanh thất bại: tự thử lại bằng cắt chính xác.
  - Huỷ giữa chừng: dừng worker.
- **Tải về**: iOS dùng Web Share, chọn “Lưu video” để vào thẳng Ảnh. Android dùng `<a download>`. Trang tải có hướng dẫn riêng khi khách đang mở trong Zalo/Facebook.
- **Lưu trữ**: highlight lưu trong IndexedDB dưới dạng ArrayBuffer, vì WebKit từ chối lưu Blob trong một số trường hợp. Có bản sao trong bộ nhớ khi bộ nhớ trình duyệt bị chặn, và tự xoá sau 3 ngày.

## Cài đặt camera EZVIZ

1. Tắt **Mã hoá video** trong ứng dụng EZVIZ.
2. Đặt chuẩn nén **H.264** nếu model hỗ trợ. Lắp thẻ nhớ, bật ghi liên tục, đồng bộ giờ.
3. `/admin/cameras`: đổi loại sang EZVIZ, nhập serial và kênh. `/admin/assign`: gán camera vào bàn.
4. `/admin/ezviz`: chọn khu vực (Việt Nam: `ivnopen.ezvizlife.com`) và cấp viewer token.
5. `/admin/status`: “Kiểm tra kết nối” và **“Thử tải 10 giây”**. Nếu bước này báo CORS thì phần cắt từ camera không chạy được thuần frontend. Khi đó khách vẫn xem live và xem lại bằng EZUIKit, và vẫn cắt được video có sẵn trên điện thoại (ví dụ tải từ app EZVIZ).
6. Xuất `venue.json`, deploy, rồi in QR ở `/admin/qr` (đặt địa chỉ website công khai trước khi in).

## Cấu trúc mã nguồn

```
src/
  core/            domain types, config (schema/repository), storage (IndexedDB), utils
  features/
    camera/        CameraProvider interface, providerRegistry
      ezviz/       EzvizApi (REST), EzvizCameraProvider, EZUIKit wrapper, FLV stream reader
      mock/        MockCameraProvider, billiards simulation, demo clip generator
    processing/    ffmpegService (WORKERFS, job queue, abort), probe parser, cutPlanner
    video/         useVideoPlayer, Timeline, trimRange rules
    highlights/    use cases (prepare/export), repository, selected-source store
    qr/            QR generate/print card, scanner (BarcodeDetector → jsQR)
    admin/         draft context
  pages/customer/  Scan, Table, Live, Recordings, Editor, Result, Download
  pages/admin/     Dashboard, Tables, Cameras, Assign, QR, EZVIZ, Status
  ui/              design kit + icons
```

Muốn thêm hãng camera khác (Imou, Hik-Connect, HLS URL…): tạo class mới implement `CameraProvider`, rồi thêm vào `providerRegistry.ts`. Không phải sửa UI.
