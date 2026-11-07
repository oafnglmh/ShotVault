import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { loadEffectiveConfig, type LoadedConfig } from "@/core/config/configRepository";
import type { BilliardTable, Camera } from "@/core/domain/types";
import type { CameraProvider } from "@/features/camera/CameraProvider";
import { getCameraProvider } from "@/features/camera/providerRegistry";

interface VenueState {
  loaded: LoadedConfig | null;
  error: string | null;
  reload(): Promise<void>;
}

const Ctx = createContext<VenueState | null>(null);

export function VenueProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoaded(await loadEffectiveConfig());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <Ctx.Provider value={{ loaded, error, reload }}>{children}</Ctx.Provider>;
}

export function useVenue(): VenueState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVenue outside VenueProvider");
  return v;
}

export type TableResolution =
  | { state: "loading" }
  | { state: "not-found" }
  | { state: "inactive"; table: BilliardTable }
  | { state: "no-camera"; table: BilliardTable }
  | { state: "ready"; table: BilliardTable; camera: Camera; provider: CameraProvider };

/**
 * Table → camera is resolved from config only. The customer never chooses a camera, and there is
 * no UI path to another table's camera from here.
 */
export function useTableResolution(tableId: string | undefined): TableResolution {
  const { loaded } = useVenue();
  if (!loaded) return { state: "loading" };
  const id = (tableId ?? "").toUpperCase();
  const table = loaded.config.tables.find((t) => t.id === id);
  if (!table) return { state: "not-found" };
  if (!table.active) return { state: "inactive", table };
  const camera = loaded.config.cameras.find((c) => c.id === table.cameraId && c.enabled);
  if (!camera) return { state: "no-camera", table };
  return { state: "ready", table, camera, provider: getCameraProvider(camera, loaded.config) };
}
