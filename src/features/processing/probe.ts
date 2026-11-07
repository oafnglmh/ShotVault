/** Parses ffmpeg's `-i` banner into what the editor needs. Pure → unit-tested. */
export interface ProbeInfo {
  durationSec: number | null;
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
}

export function parseProbeLog(log: string): ProbeInfo {
  const info: ProbeInfo = { durationSec: null, container: null, videoCodec: null, audioCodec: null, width: null, height: null, fps: null };
  const input = log.match(/Input #0, ([^,]+(?:,[^,]+)*?), from/);
  if (input) info.container = input[1].split(",")[0].trim();
  const dur = log.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (dur) info.durationSec = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
  const video = log.match(/Stream #0:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Video: ([a-z0-9_]+)[^\n]*/i);
  if (video) {
    info.videoCodec = video[1].toLowerCase();
    const size = video[0].match(/, (\d{2,5})x(\d{2,5})/);
    if (size) {
      info.width = Number(size[1]);
      info.height = Number(size[2]);
    }
    const fps = video[0].match(/, (\d+(?:\.\d+)?) fps/);
    if (fps) info.fps = Number(fps[1]);
  }
  const audio = log.match(/Stream #0:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Audio: ([a-z0-9_]+)/i);
  if (audio) info.audioCodec = audio[1].toLowerCase();
  return info;
}

export function describeCodec(codec: string | null): string {
  switch (codec) {
    case "h264":
      return "H.264";
    case "hevc":
      return "H.265 (HEVC)";
    case "vp8":
    case "vp9":
    case "av1":
      return codec.toUpperCase();
    default:
      return codec ?? "không rõ";
  }
}
