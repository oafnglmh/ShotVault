import QRCode from "qrcode";
import type { BilliardTable, VenueConfig } from "@/core/domain/types";
import { ID_PATTERN } from "@/core/config/venueSchema";

/** QR identifies a table — nothing more. It is not an access-control mechanism. */
export function tableUrl(venue: VenueConfig, tableId: string): string {
  const base = venue.publicBaseUrl || window.location.origin;
  return `${base}/play/${encodeURIComponent(tableId)}`;
}

/** Extracts a table id from scanned text, only if it points at a /play/<ID> path. */
export function parseTableFromScan(text: string): string | null {
  try {
    const url = new URL(text.trim(), window.location.origin);
    const m = url.pathname.match(/\/play\/([^/?#]+)/);
    if (!m) return null;
    const id = decodeURIComponent(m[1]).toUpperCase();
    return ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function qrDataUrl(text: string, size = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "Q",
    margin: 1,
    width: size,
    color: { dark: "#0b0d0c", light: "#ffffff" },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Printable table card (A6-ish portrait, 1240×1748 px ≈ 300 dpi) as a PNG blob. */
export async function renderTableCard(venue: VenueConfig, table: BilliardTable): Promise<Blob> {
  const W = 1240;
  const H = 1748;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas không khả dụng");
  await document.fonts?.ready;

  ctx.fillStyle = "#0b0d0c";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c8a45d";
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.textAlign = "center";
  ctx.fillStyle = "#c8a45d";
  ctx.font = '600 34px "Be Vietnam Pro", sans-serif';
  ctx.fillText(venue.venueName.toUpperCase(), W / 2, 170);

  ctx.fillStyle = "#f3efe6";
  ctx.font = '700 150px "Cormorant Garamond", serif';
  ctx.fillText(table.name, W / 2, 360);

  const qrSize = 760;
  const qrX = (W - qrSize) / 2;
  const qrY = 450;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 30, qrY - 30, qrSize + 60, qrSize + 60);
  const img = await loadImage(await qrDataUrl(tableUrl(venue, table.id), qrSize));
  ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#f3efe6";
  ctx.font = '600 54px "Be Vietnam Pro", sans-serif';
  ctx.fillText("Quét để lưu cú đánh đẹp", W / 2, 1390);
  ctx.fillStyle = "#98a39d";
  ctx.font = '400 36px "Be Vietnam Pro", sans-serif';
  ctx.fillText("Xem lại camera bàn · Cắt highlight · Tải về điện thoại", W / 2, 1460);
  ctx.fillText("Không cần cài ứng dụng", W / 2, 1515);

  ctx.fillStyle = "#6b7570";
  ctx.font = '500 28px "Be Vietnam Pro", sans-serif';
  ctx.fillText(table.id, W / 2, 1640);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
