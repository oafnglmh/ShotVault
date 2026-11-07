import { Outlet, useOutletContext, useParams } from "react-router-dom";
import { useTableResolution, useVenue } from "@/app/VenueContext";
import type { BilliardTable, Camera, VenueConfig } from "@/core/domain/types";
import type { CameraProvider } from "@/features/camera/CameraProvider";
import { EmptyState, LinkButton, Spinner } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";

export interface TableContext {
  table: BilliardTable;
  camera: Camera;
  provider: CameraProvider;
  venue: VenueConfig;
  base: string;
}

export const useTableContext = () => useOutletContext<TableContext>();

/** Resolves /play/:tableId → table + camera once, for every customer page below it. */
export function TableShell() {
  const { tableId } = useParams();
  const { loaded } = useVenue();
  const res = useTableResolution(tableId);

  if (res.state === "loading" || !loaded) {
    return (
      <CustomerLayout>
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      </CustomerLayout>
    );
  }
  if (res.state !== "ready") {
    const copy = {
      "not-found": { t: "Không tìm thấy bàn", d: "Mã QR này không thuộc quán hoặc đã cũ. Vui lòng quét lại mã dán trên bàn." },
      inactive: { t: "Bàn đang tạm ngưng", d: "Chức năng camera của bàn này đang tạm tắt. Vui lòng liên hệ nhân viên." },
      "no-camera": { t: "Bàn chưa có camera", d: "Bàn này chưa được gắn camera. Vui lòng liên hệ nhân viên." },
    }[res.state];
    return (
      <CustomerLayout>
        <EmptyState title={copy.t} action={<LinkButton to="/" variant="secondary">Quét mã khác</LinkButton>}>
          {copy.d}
        </EmptyState>
      </CustomerLayout>
    );
  }
  const ctx: TableContext = {
    table: res.table,
    camera: res.camera,
    provider: res.provider,
    venue: loaded.config,
    base: `/play/${res.table.id}`,
  };
  return <Outlet context={ctx} />;
}
