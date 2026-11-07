/**
 * Deterministic top-down pool simulation rendered to a canvas. Used ONLY for DEMO mode:
 * every frame is stamped "DEMO · MÔ PHỎNG" so it can never be mistaken for a real camera.
 */

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  stripe: boolean;
  n: number;
  pocketed: boolean;
}

const TABLE_W = 2.54; // metres (9ft playfield)
const TABLE_H = 1.27;
const R = 0.0286;
const FRICTION = 0.985;
const POCKETS: Array<[number, number]> = [
  [0, 0],
  [TABLE_W / 2, 0],
  [TABLE_W, 0],
  [0, TABLE_H],
  [TABLE_W / 2, TABLE_H],
  [TABLE_W, TABLE_H],
];
const COLORS = ["#f2c230", "#2257b5", "#c8312b", "#5b2a86", "#e06b1f", "#1d7a46", "#7a2a22", "#111111"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class BilliardsSim {
  balls: Ball[] = [];
  private rand: () => number;
  private nextShotAt = 1.2;
  t = 0;

  constructor(seed = 7) {
    this.rand = rng(seed);
    this.rack();
  }

  private rack() {
    this.balls = [{ x: TABLE_W * 0.25, y: TABLE_H / 2, vx: 0, vy: 0, color: "#f4f1e8", stripe: false, n: 0, pocketed: false }];
    let n = 1;
    const apexX = TABLE_W * 0.72;
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= row; i++) {
        const x = apexX + row * R * 1.75;
        const y = TABLE_H / 2 + (i - row / 2) * R * 2.02;
        this.balls.push({ x, y, vx: 0, vy: 0, color: COLORS[(n - 1) % 8], stripe: n > 8, n, pocketed: false });
        n++;
      }
    }
  }

  private shoot() {
    const cue = this.balls[0];
    if (cue.pocketed) {
      cue.pocketed = false;
      cue.x = TABLE_W * 0.25;
      cue.y = TABLE_H / 2;
    }
    const targets = this.balls.filter((b) => !b.pocketed && b.n !== 0);
    if (targets.length === 0) {
      this.rack();
      return;
    }
    const target = targets[Math.floor(this.rand() * targets.length)];
    const dx = target.x - cue.x;
    const dy = target.y - cue.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = 3.2 + this.rand() * 2.4;
    const spread = (this.rand() - 0.5) * 0.06;
    cue.vx = (dx / d) * speed + spread;
    cue.vy = (dy / d) * speed - spread;
  }

  step(dt: number) {
    this.t += dt;
    const sub = 4;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (const b of this.balls) {
        if (b.pocketed) continue;
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x < R) (b.x = R), (b.vx = Math.abs(b.vx) * 0.8);
        if (b.x > TABLE_W - R) (b.x = TABLE_W - R), (b.vx = -Math.abs(b.vx) * 0.8);
        if (b.y < R) (b.y = R), (b.vy = Math.abs(b.vy) * 0.8);
        if (b.y > TABLE_H - R) (b.y = TABLE_H - R), (b.vy = -Math.abs(b.vy) * 0.8);
        for (const [px, py] of POCKETS) {
          if (Math.hypot(b.x - px, b.y - py) < R * 2.1) {
            b.pocketed = true;
            b.vx = b.vy = 0;
          }
        }
      }
      for (let i = 0; i < this.balls.length; i++) {
        const a = this.balls[i];
        if (a.pocketed) continue;
        for (let j = i + 1; j < this.balls.length; j++) {
          const b = this.balls[j];
          if (b.pocketed) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist < 2 * R) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = 2 * R - dist;
            a.x -= (nx * overlap) / 2;
            a.y -= (ny * overlap) / 2;
            b.x += (nx * overlap) / 2;
            b.y += (ny * overlap) / 2;
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) {
              a.vx -= rel * nx * 0.96;
              a.vy -= rel * ny * 0.96;
              b.vx += rel * nx * 0.96;
              b.vy += rel * ny * 0.96;
            }
          }
        }
      }
    }
    const f = Math.pow(FRICTION, dt * 60);
    let moving = false;
    for (const b of this.balls) {
      b.vx *= f;
      b.vy *= f;
      if (Math.hypot(b.vx, b.vy) < 0.01) b.vx = b.vy = 0;
      else moving = true;
    }
    if (!moving && this.t >= this.nextShotAt) {
      this.shoot();
      this.nextShotAt = this.t + 2.5 + this.rand() * 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, stamp: string) {
    ctx.fillStyle = "#0d0f0e";
    ctx.fillRect(0, 0, w, h);
    const margin = Math.round(w * 0.06);
    const rail = Math.round(w * 0.028);
    const fw = w - margin * 2;
    const fh = (fw * TABLE_H) / TABLE_W;
    const fy = Math.max(rail + 4, (h - fh) / 2);
    ctx.fillStyle = "#3b2416";
    ctx.fillRect(margin - rail, fy - rail, fw + rail * 2, fh + rail * 2);
    ctx.fillStyle = "#1f5c3f";
    ctx.fillRect(margin, fy, fw, fh);
    const s = fw / TABLE_W;
    ctx.fillStyle = "#070807";
    for (const [px, py] of POCKETS) {
      ctx.beginPath();
      ctx.arc(margin + px * s, fy + py * s, R * s * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(243,239,230,0.12)";
    ctx.beginPath();
    ctx.moveTo(margin + TABLE_W * 0.25 * s, fy);
    ctx.lineTo(margin + TABLE_W * 0.25 * s, fy + fh);
    ctx.stroke();
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const x = margin + b.x * s;
      const y = fy + b.y * s;
      const r = R * s;
      ctx.fillStyle = b.stripe ? "#f4f1e8" : b.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (b.stripe) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = b.color;
        ctx.fillRect(x - r, y - r * 0.5, r * 2, r);
        ctx.restore();
      }
    }
    // Unmistakable DEMO stamp + clock, like a camera OSD.
    const fs = Math.max(11, Math.round(h * 0.045));
    ctx.font = `600 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const label = "DEMO · MÔ PHỎNG";
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = "#c8a45d";
    ctx.fillRect(10, 10, lw + 16, fs + 10);
    ctx.fillStyle = "#0b0d0c";
    ctx.fillText(label, 18, 15);
    ctx.fillStyle = "rgba(243,239,230,0.92)";
    const sw = ctx.measureText(stamp).width;
    ctx.fillText(stamp, w - sw - 14, 15);
  }
}
