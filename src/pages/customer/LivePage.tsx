import { CameraView } from "@/features/camera/components/CameraView";
import { IconScissors } from "@/ui/icons";
import { LinkButton, ModeBadge, Notice } from "@/ui/kit";
import { CustomerLayout } from "./CustomerLayout";
import { useTableContext } from "./TableShell";

/** Customer screen 3 — live camera of THIS table only. */
export function LivePage() {
  const { table, camera, provider, base } = useTableContext();
  return (
    <CustomerLayout back={base} title={<span className="font-semibold">{table.name} · Trực tiếp</span>} right={<ModeBadge mode={provider.mode} />} wide>
      <CameraView provider={provider} camera={camera} />
      <p className="mt-3 text-sm text-muted">
        Vừa có cú đánh đẹp? Bấm nút bên dưới để lấy lại đoạn vừa ghi và cắt highlight.
      </p>
      <div className="mt-4 max-w-lg">
        <LinkButton to={`${base}/recordings?last=2`} variant="primary" size="lg">
          <IconScissors /> Cắt đoạn vừa xong
        </LinkButton>
      </div>
      {provider.mode === "REAL" && (
        <Notice className="mt-5 max-w-lg" title="Lưu ý">
          Hình ảnh trực tiếp đi qua máy chủ EZVIZ và có thể trễ vài giây. Video highlight được lấy từ thẻ nhớ của camera.
        </Notice>
      )}
    </CustomerLayout>
  );
}
