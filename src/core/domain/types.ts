/** Domain model. No React, no browser APIs — pure data shapes shared by every feature. */

export type ProviderKind = "mock" | "ezviz";

/** DEMO = simulated camera, REAL = an actual camera vendor integration. Never mixed up in the UI. */
export type RunMode = "DEMO" | "REAL";

export interface MockCameraConfig {
  provider: "mock";
  /** Optional static demo clip (e.g. /demo/table01.mp4) deployed next to the site. */
  demoClipUrl?: string;
}

export interface EzvizCameraConfig {
  provider: "ezviz";
  deviceSerial: string;
  channelNo: number;
}

export type CameraConnection = MockCameraConfig | EzvizCameraConfig;

export interface Camera {
  id: string;
  name: string;
  model?: string;
  connection: CameraConnection;
  enabled: boolean;
}

export interface BilliardTable {
  /** Stable code printed into the QR, e.g. TABLE_01. */
  id: string;
  name: string;
  cameraId: string | null;
  active: boolean;
  note?: string;
}

/**
 * EZVIZ settings that are SAFE to publish in a static site.
 * `viewerToken` is intentionally public: it must be a least-privilege
 * RAM sub-account token restricted to these devices. Never the appSecret,
 * never the main account token, never the device verification code.
 */
export interface EzvizPublicConfig {
  apiDomain: string;
  ezopenHost: string;
  viewerToken: string;
  viewerTokenExpiresAt: number | null;
  /** Recording source used for playback/clip export: 2 = SD card (local), 3 = cloud. */
  recordingType: 2 | 3;
}

export interface ClipLimits {
  /** Longest highlight allowed with stream-copy cutting. */
  maxClipSeconds: number;
  /** Longest highlight allowed when re-encoding (precise cut) — CPU/RAM heavy on phones. */
  maxPreciseSeconds: number;
  /** Longest window fetched from a camera recording in one go. */
  maxFetchSeconds: number;
}

export interface VenueConfig {
  schemaVersion: 1;
  venueName: string;
  publicBaseUrl: string;
  tables: BilliardTable[];
  cameras: Camera[];
  ezviz: EzvizPublicConfig;
  limits: ClipLimits;
  updatedAt: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface RecordingSegment {
  /** epoch ms */
  startTime: number;
  endTime: number;
  source: "sdcard" | "cloud" | "demo";
  label?: string;
  /** For demo clips stored on this device. */
  demoClipId?: string;
}

export type CameraHealth = "online" | "offline" | "unknown" | "misconfigured" | "demo";

export interface CameraStatus {
  health: CameraHealth;
  message: string;
  checkedAt: number;
}

export interface Highlight {
  id: string;
  tableId: string;
  cameraId: string | null;
  createdAt: number;
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
  sourceLabel: string;
  mode: RunMode;
  blob: Blob;
}
