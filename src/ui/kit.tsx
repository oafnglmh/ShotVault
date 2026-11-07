import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import type { CameraHealth, RunMode } from "@/core/domain/types";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-chalk text-ink hover:bg-white active:bg-[#e6e1d6] disabled:bg-line disabled:text-faint",
  secondary: "border border-line-strong bg-panel-2 text-chalk hover:border-muted disabled:text-faint disabled:border-line",
  ghost: "text-muted hover:text-chalk hover:bg-panel-2 disabled:text-faint",
  danger: "border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-14 px-5 text-base rounded-xl gap-2.5 w-full",
};

const base =
  "inline-flex items-center justify-center font-semibold transition-colors select-none disabled:cursor-not-allowed whitespace-nowrap";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }
>(function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx(base, variants[variant], sizes[size], className)}
      disabled={disabled || busy}
      {...rest}
    >
      {busy && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={cx(base, variants[variant], sizes[size], className)} {...rest} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-[var(--radius-card)] border border-line bg-panel", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "h-5 w-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ ratio, className }: { ratio: number | null; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-line", className)} role="progressbar" aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      {ratio === null ? (
        <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-felt-bright" />
      ) : (
        <div className="h-full rounded-full bg-felt-bright transition-[width] duration-300" style={{ width: `${Math.round(ratio * 100)}%` }} />
      )}
    </div>
  );
}

export function ModeBadge({ mode, className }: { mode: RunMode; className?: string }) {
  return mode === "DEMO" ? (
    <span className={cx("inline-flex items-center rounded-md bg-brass px-2 py-0.5 text-[11px] font-bold tracking-wider text-ink", className)} title="Đang dùng camera mô phỏng, không phải camera thật">
      DEMO
    </span>
  ) : (
    <span className={cx("inline-flex items-center rounded-md border border-felt-bright/50 px-2 py-0.5 text-[11px] font-bold tracking-wider text-felt-bright", className)}>
      CAMERA THẬT
    </span>
  );
}

const healthStyle: Record<CameraHealth, { dot: string; label: string }> = {
  online: { dot: "bg-felt-bright", label: "Trực tuyến" },
  offline: { dot: "bg-danger", label: "Mất kết nối" },
  unknown: { dot: "bg-warn", label: "Chưa rõ" },
  misconfigured: { dot: "bg-warn", label: "Thiếu cấu hình" },
  demo: { dot: "bg-brass", label: "Mô phỏng" },
};

export function HealthDot({ health, withLabel = true }: { health: CameraHealth | "checking"; withLabel?: boolean }) {
  if (health === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Spinner className="h-3 w-3" /> Đang kiểm tra
      </span>
    );
  }
  const s = healthStyle[health];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={cx("h-2 w-2 rounded-full", s.dot)} />
      {withLabel && s.label}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "error" | "demo";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-line-strong bg-panel-2",
    warn: "border-warn/40 bg-warn/5",
    error: "border-danger/40 bg-danger/5",
    demo: "border-brass/40 bg-brass/5",
  };
  const titleColor = { info: "text-chalk", warn: "text-warn", error: "text-danger", demo: "text-brass" };
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone], className)} role={tone === "error" ? "alert" : undefined}>
      {title && <div className={cx("mb-0.5 font-semibold", titleColor[tone])}>{title}</div>}
      {children && <div className="leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/** Ball-style plaque used for table numbers. */
export function TablePlaque({ label, size = "md" }: { label: string; size?: "md" | "lg" }) {
  const n = label.match(/\d+/)?.[0] ?? label.slice(0, 2);
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-chalk font-display font-bold text-ink",
        size === "lg" ? "h-16 w-16 text-3xl" : "h-10 w-10 text-lg",
      )}
      aria-hidden
    >
      <span className={cx("absolute rounded-full border-2 border-felt", size === "lg" ? "inset-2" : "inset-1")} />
      <span className="relative">{n}</span>
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="font-display text-2xl text-chalk">{title}</div>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
