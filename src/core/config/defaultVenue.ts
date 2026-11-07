import type { VenueConfig } from "../domain/types";

/** Used only when /config/venue.json is missing or invalid, and as the seed for a fresh admin draft. */
export const DEFAULT_VENUE: VenueConfig = {
  schemaVersion: 1,
  venueName: "Billiards Club",
  publicBaseUrl: "",
  tables: [
    { id: "TABLE_01", name: "Bàn 01", cameraId: "CAM_01", active: true },
    { id: "TABLE_02", name: "Bàn 02", cameraId: "CAM_02", active: true },
    { id: "TABLE_03", name: "Bàn 03", cameraId: "CAM_03", active: true },
  ],
  cameras: [
    { id: "CAM_01", name: "Camera 01 (mô phỏng)", connection: { provider: "mock" }, enabled: true },
    { id: "CAM_02", name: "Camera 02 (mô phỏng)", connection: { provider: "mock" }, enabled: true },
    { id: "CAM_03", name: "Camera 03 (mô phỏng)", connection: { provider: "mock" }, enabled: true },
  ],
  ezviz: {
    apiDomain: "https://ivnopen.ezvizlife.com",
    ezopenHost: "open.ys7.com",
    viewerToken: "",
    viewerTokenExpiresAt: null,
    recordingType: 2,
  },
  limits: { maxClipSeconds: 120, maxPreciseSeconds: 45, maxFetchSeconds: 300 },
  updatedAt: 0,
};
