/**
 * Thin wrapper around EZUIKit-JS (official EZVIZ web player, `ezuikit-js` on npm).
 * Loaded lazily so DEMO-only deployments never download it. EZUIKit fetches its wasm
 * decoder from the EZVIZ CDN by default (release builds), so nothing extra is self-hosted.
 */
import type { ViewEvents, ViewHandle } from "../CameraProvider";

interface EzuikitInstance {
  stop?: () => Promise<unknown> | unknown;
  destroy?: () => Promise<unknown> | unknown;
  eventEmitter?: { on(evt: string, cb: (...args: unknown[]) => void): void };
}

type EzuikitCtor = new (opts: Record<string, unknown>) => EzuikitInstance;

let loader: Promise<EzuikitCtor> | null = null;

function loadEzuikit(): Promise<EzuikitCtor> {
  if (!loader) {
    loader = import("ezuikit-js")
      .then((m) => {
        const mod = m as unknown as { EZUIKitPlayer?: EzuikitCtor; default?: { EZUIKitPlayer?: EzuikitCtor } };
        const ctor = mod.EZUIKitPlayer ?? mod.default?.EZUIKitPlayer;
        if (!ctor) throw new Error("Không tìm thấy EZUIKitPlayer trong gói ezuikit-js");
        return ctor;
      })
      .catch((e) => {
        loader = null;
        throw e;
      });
  }
  return loader;
}

let seq = 0;

export async function mountEzuikit(
  container: HTMLElement,
  opts: { url: string; accessToken: string; domain: string; template: string },
  events?: ViewEvents,
): Promise<ViewHandle> {
  const Player = await loadEzuikit();
  const host = document.createElement("div");
  host.id = `ezuikit-${++seq}`;
  host.style.width = "100%";
  host.style.height = "100%";
  container.innerHTML = "";
  container.appendChild(host);
  const rect = container.getBoundingClientRect();
  const width = Math.max(240, Math.round(rect.width));
  const height = Math.max(135, Math.round(rect.height || (width * 9) / 16));

  let destroyed = false;
  const player = new Player({
    id: host.id,
    url: opts.url,
    accessToken: opts.accessToken,
    template: opts.template,
    width,
    height,
    language: "en",
    env: { domain: opts.domain },
    handleSuccess: () => events?.onReady?.(),
    handleError: (err: unknown) => {
      if (destroyed) return;
      events?.onError?.(describeEzuikitError(err));
    },
  });

  return {
    destroy() {
      destroyed = true;
      try {
        void player.stop?.();
        void player.destroy?.();
      } catch {
        /* player already torn down */
      }
      container.innerHTML = "";
    },
  };
}

function describeEzuikitError(err: unknown): string {
  const e = err as { retcode?: number | string; msg?: string; data?: { nErrorCode?: number }; type?: string } | undefined;
  if (e?.data?.nErrorCode === 5) return "Camera đang bật mã hoá video — cần tắt mã hoá trong ứng dụng EZVIZ.";
  const code = String(e?.retcode ?? "");
  if (code === "10002") return "Token xem camera đã hết hạn. Vui lòng báo nhân viên quán.";
  if (code === "20007") return "Camera đang mất kết nối.";
  return e?.msg ? `Trình phát EZVIZ báo lỗi: ${e.msg}` : "Trình phát EZVIZ không phát được video.";
}
