/**
 * Compact MD5 (RFC 1321) over the UTF-8 bytes of a string, returning lowercase hex.
 * WebCrypto has no MD5; this exists only for the legacy Imou signature scheme.
 */
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Hex(input: string): string {
  const msg = new TextEncoder().encode(input);
  const len = ((msg.length + 8) >>> 6) + 1; // number of 64-byte blocks
  const words = new Uint32Array(len * 16);
  msg.forEach((b, i) => (words[i >> 2] |= b << ((i % 4) * 8)));
  words[msg.length >> 2] |= 0x80 << ((msg.length % 4) * 8);
  const bitLen = msg.length * 8;
  words[len * 16 - 2] = bitLen >>> 0;
  words[len * 16 - 1] = Math.floor(bitLen / 2 ** 32);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let blk = 0; blk < len; blk++) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) (f = (b & c) | (~b & d)), (g = i);
      else if (i < 32) (f = (d & b) | (~d & c)), (g = (5 * i + 1) % 16);
      else if (i < 48) (f = b ^ c ^ d), (g = (3 * i + 5) % 16);
      else (f = c ^ (b | ~d)), (g = (7 * i) % 16);
      const tmp = d;
      d = c;
      c = b;
      const x = (a + f + K[i] + words[blk * 16 + g]) >>> 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0]
    .map((w) => Array.from({ length: 4 }, (_, i) => ((w >>> (i * 8)) & 0xff).toString(16).padStart(2, "0")).join(""))
    .join("");
}
