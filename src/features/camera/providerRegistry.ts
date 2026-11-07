import type { Camera, VenueConfig } from "@/core/domain/types";
import type { CameraProvider } from "./CameraProvider";
import { EzvizCameraProvider } from "./ezviz/EzvizCameraProvider";
import { MockCameraProvider } from "./mock/MockCameraProvider";

/** The only place that maps a camera's `connection.provider` to an implementation. */
const mock = new MockCameraProvider();
const ezvizCache = new WeakMap<VenueConfig["ezviz"], EzvizCameraProvider>();

export function getCameraProvider(camera: Camera, venue: VenueConfig): CameraProvider {
  switch (camera.connection.provider) {
    case "ezviz": {
      let p = ezvizCache.get(venue.ezviz);
      if (!p) {
        p = new EzvizCameraProvider(venue.ezviz);
        ezvizCache.set(venue.ezviz, p);
      }
      return p;
    }
    case "mock":
    default:
      return mock;
  }
}

export const PROVIDER_OPTIONS = [
  { value: "mock", label: "Mô phỏng (DEMO)" },
  { value: "ezviz", label: "EZVIZ (REAL)" },
] as const;
