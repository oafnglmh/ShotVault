import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useVenue } from "@/app/VenueContext";
import { IconBack } from "@/ui/icons";
import { cx } from "@/ui/kit";

export function CustomerLayout({
  children,
  back,
  title,
  right,
  wide,
}: {
  children: ReactNode;
  back?: string;
  title?: ReactNode;
  right?: ReactNode;
  wide?: boolean;
}) {
  const { loaded } = useVenue();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className={cx("mx-auto flex h-14 items-center gap-3 px-4", wide ? "max-w-3xl" : "max-w-lg")}>
          {back ? (
            <Link to={back} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-chalk" aria-label="Quay lại">
              <IconBack />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ?? <span className="font-display text-xl font-semibold tracking-wide">{loaded?.config.venueName ?? "Billiards"}</span>}
          </div>
          {right}
        </div>
      </header>
      <main className={cx("mx-auto w-full flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-5", wide ? "max-w-3xl" : "max-w-lg")}>
        {children}
      </main>
    </div>
  );
}
