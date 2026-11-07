import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Link } from "react-router-dom";
import { EmptyState, Spinner } from "@/ui/kit";
import { CustomerLayout } from "@/pages/customer/CustomerLayout";
import { ScanPage } from "@/pages/customer/ScanPage";
import { TableShell } from "@/pages/customer/TableShell";
import { TablePage } from "@/pages/customer/TablePage";

// Heavy screens are split so the QR → table landing stays fast on 4G.
const LivePage = lazy(() => import("@/pages/customer/LivePage").then((m) => ({ default: m.LivePage })));
const RecordingsPage = lazy(() => import("@/pages/customer/RecordingsPage").then((m) => ({ default: m.RecordingsPage })));
const EditorPage = lazy(() => import("@/pages/customer/EditorPage").then((m) => ({ default: m.EditorPage })));
const ResultPage = lazy(() => import("@/pages/customer/ResultPage").then((m) => ({ default: m.ResultPage })));
const DownloadPage = lazy(() => import("@/pages/customer/DownloadPage").then((m) => ({ default: m.DownloadPage })));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const DashboardPage = lazy(() => import("@/pages/admin/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TablesPage = lazy(() => import("@/pages/admin/TablesPage").then((m) => ({ default: m.TablesPage })));
const CamerasPage = lazy(() => import("@/pages/admin/CamerasPage").then((m) => ({ default: m.CamerasPage })));
const AssignPage = lazy(() => import("@/pages/admin/AssignPage").then((m) => ({ default: m.AssignPage })));
const QrPage = lazy(() => import("@/pages/admin/QrPage").then((m) => ({ default: m.QrPage })));
const EzvizPage = lazy(() => import("@/pages/admin/EzvizPage").then((m) => ({ default: m.EzvizPage })));
const StatusPage = lazy(() => import("@/pages/admin/StatusPage").then((m) => ({ default: m.StatusPage })));

const S = ({ children }: { children: ReactNode }) => (
  <Suspense
    fallback={
      <div className="flex min-h-[50dvh] items-center justify-center text-muted">
        <Spinner />
      </div>
    }
  >
    {children}
  </Suspense>
);

function NotFound() {
  return (
    <CustomerLayout>
      <EmptyState title="Không tìm thấy trang" action={<Link className="text-felt-bright underline" to="/">Về trang quét QR</Link>}>
        Hãy quét lại mã QR dán trên bàn bida.
      </EmptyState>
    </CustomerLayout>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <ScanPage /> },
  { path: "/scan", element: <ScanPage /> },
  {
    path: "/play/:tableId",
    element: <TableShell />,
    children: [
      { index: true, element: <TablePage /> },
      { path: "live", element: <S><LivePage /></S> },
      { path: "recordings", element: <S><RecordingsPage /></S> },
      { path: "editor", element: <S><EditorPage /></S> },
      { path: "highlight/:hid", element: <S><ResultPage /></S> },
      { path: "highlight/:hid/download", element: <S><DownloadPage /></S> },
    ],
  },
  {
    path: "/admin",
    element: <S><AdminLayout /></S>,
    children: [
      { index: true, element: <S><DashboardPage /></S> },
      { path: "tables", element: <S><TablesPage /></S> },
      { path: "cameras", element: <S><CamerasPage /></S> },
      { path: "assign", element: <S><AssignPage /></S> },
      { path: "qr", element: <S><QrPage /></S> },
      { path: "ezviz", element: <S><EzvizPage /></S> },
      { path: "status", element: <S><StatusPage /></S> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
