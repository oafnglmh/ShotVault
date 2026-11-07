/**
 * Reads an HTTP-FLV stream chunk by chunk, tracking tag timestamps so we can:
 *  - report real progress (media time received / requested duration),
 *  - stop as soon as the requested window is covered (playback streams may keep going),
 *  - refuse to buffer more than `maxBytes` (phones run out of RAM long before disk).
 *
 * Only the minimal FLV structure is parsed: 9-byte header, then
 * [prevTagSize:4][type:1][dataSize:3][ts:3][tsExt:1][streamId:3][data:dataSize] …
 */

export interface FlvReadOptions {
  durationMs: number;
  maxBytes: number;
  stallTimeoutMs: number;
  signal?: AbortSignal;
  onProgress?(receivedMediaMs: number, bytes: number): void;
}

export interface FlvReadResult {
  chunks: Uint8Array[];
  bytes: number;
  mediaMs: number;
  complete: boolean;
  reason: "covered" | "ended" | "limit" | "stalled";
}

export class FlvTagScanner {
  private buf = new Uint8Array(0);
  private headerDone = false;
  private firstTs: number | null = null;
  lastTs = 0;
  validFlv = true;

  /** Feed bytes; returns media time (ms) relative to the first tag seen. */
  push(chunk: Uint8Array): number {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    let pos = 0;
    if (!this.headerDone) {
      if (merged.length < 13) {
        this.buf = merged;
        return 0;
      }
      if (merged[0] !== 0x46 || merged[1] !== 0x4c || merged[2] !== 0x56) {
        this.validFlv = false;
        this.buf = new Uint8Array(0);
        return 0;
      }
      const headerSize = (merged[5] << 24) | (merged[6] << 16) | (merged[7] << 8) | merged[8];
      pos = headerSize + 4; // header + PreviousTagSize0
      this.headerDone = true;
    }
    while (pos + 11 <= merged.length) {
      const dataSize = (merged[pos + 1] << 16) | (merged[pos + 2] << 8) | merged[pos + 3];
      const ts = ((merged[pos + 7] << 24) | (merged[pos + 4] << 16) | (merged[pos + 5] << 8) | merged[pos + 6]) >>> 0;
      const tagEnd = pos + 11 + dataSize + 4;
      if (tagEnd > merged.length) break;
      const type = merged[pos] & 0x1f;
      if (type === 8 || type === 9) {
        if (this.firstTs === null) this.firstTs = ts;
        this.lastTs = Math.max(this.lastTs, ts - this.firstTs);
      }
      pos = tagEnd;
    }
    this.buf = merged.slice(pos);
    return this.lastTs;
  }
}

export async function readFlvStream(body: ReadableStream<Uint8Array>, opts: FlvReadOptions): Promise<FlvReadResult> {
  const reader = body.getReader();
  const scanner = new FlvTagScanner();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let mediaMs = 0;
  let reason: FlvReadResult["reason"] = "ended";

  const abort = () => reader.cancel().catch(() => undefined);
  opts.signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const stall = new Promise<"stall">((r) => (stallTimer = setTimeout(() => r("stall"), opts.stallTimeoutMs)));
      const next = await Promise.race([reader.read(), stall]);
      clearTimeout(stallTimer);
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (next === "stall") {
        reason = "stalled";
        break;
      }
      if (next.done) break;
      chunks.push(next.value);
      bytes += next.value.byteLength;
      mediaMs = scanner.push(next.value);
      opts.onProgress?.(mediaMs, bytes);
      if (scanner.validFlv && mediaMs >= opts.durationMs) {
        reason = "covered";
        break;
      }
      if (bytes >= opts.maxBytes) {
        reason = "limit";
        break;
      }
    }
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    reader.cancel().catch(() => undefined);
  }
  return { chunks, bytes, mediaMs, complete: reason === "covered", reason };
}
