import { NavLink, Outlet } from "react-router-dom";
import { AdminDraftProvider, useAdminDraft } from "@/features/admin/AdminDraftContext";
import { Notice, Spinner, cx } from "@/ui/kit";

const NAV = [
  { to: "/admin", label: "Tổng quan", end: true },
  { to: "/admin/tables", label: "Bàn" },
  { to: "/admin/cameras", label: "Camera" },
  { to: "/admin/assign", label: "Gán camera" },
  { to: "/admin/qr", label: "Mã QR" },
  { to: "/admin/ezviz", label: "EZVIZ" },
  { to: "/admin/status", label: "Trạng thái" },
];

export function AdminLayout() {
  return (
    <AdminDraftProvider>
      <AdminFrame />
    </AdminDraftProvider>
  );
}

function AdminFrame() {
  const { draft, saving, saveError } = useAdminDraft();
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="no-print border-b border-line bg-panel lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-5 lg:py-6">
          <div>
            <div className="eyebrow">Quản trị</div>
            <div className="font-display text-2xl font-semibold">{draft?.venueName ?? "Billiards"}</div>
          </div>
          <div className="text-xs text-faint lg:mt-2">{saving ? "Đang lưu nháp…" : "Đã lưu nháp trên máy này"}</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
                  isActive ? "bg-felt text-chalk" : "text-muted hover:bg-panel-2 hover:text-chalk",
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">
          {saveError && (
            <Notice tone="error" title="Không lưu được bản nháp" className="mb-5">
              {saveError}
            </Notice>
          )}
          {draft ? (
            <Outlet />
          ) : (
            <div className="flex justify-center py-20 text-muted">
              <Spinner />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl font-semibold">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
