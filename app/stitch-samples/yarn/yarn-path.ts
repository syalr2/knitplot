type Point = { x: number; y: number };

/** Retain samples of the drawing path so fibre strokes follow its tangent.
 * This affects surface appearance only, never the stitch layout. */
export class YarnPath {
  readonly native = new Path2D();
  readonly points: Point[] = [];
  moveTo(x: number, y: number) {
    this.native.moveTo(x, y);
    this.points.push({ x, y });
  }
  bezierCurveTo(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    y: number,
  ) {
    const start = this.points.at(-1)!;
    this.native.bezierCurveTo(a, b, c, d, x, y);
    for (let i = 1; i <= 24; i++) {
      const t = i / 24,
        s = 1 - t;
      this.points.push({
        x:
          s * s * s * start.x +
          3 * s * s * t * a +
          3 * s * t * t * c +
          t * t * t * x,
        y:
          s * s * s * start.y +
          3 * s * s * t * b +
          3 * s * t * t * d +
          t * t * t * y,
      });
    }
  }
  quadraticCurveTo(a: number, b: number, x: number, y: number) {
    const start = this.points.at(-1)!;
    this.native.quadraticCurveTo(a, b, x, y);
    for (let i = 1; i <= 24; i++) {
      const t = i / 24,
        s = 1 - t;
      this.points.push({
        x: s * s * start.x + 2 * s * t * a + t * t * x,
        y: s * s * start.y + 2 * s * t * b + t * t * y,
      });
    }
  }
}

export function drawFibres(
  ctx: CanvasRenderingContext2D,
  path: YarnPath,
  diameter: number,
  colour: string,
) {
  const points = path.points;
  if (points.length < 2) return;
  const samples = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)],
      after = points[Math.min(points.length - 1, i + 1)];
    const dx = after.x - before.x,
      dy = after.y - before.y,
      length = Math.hypot(dx, dy) || 1;
    return { ...p, nx: -dy / length, ny: dx / length };
  });
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Many low-contrast filaments avoid the broad white highlight that bleaches colour.
  for (let fibre = 0; fibre < 19; fibre++) {
    const offset = (fibre / 18 - 0.5) * diameter * 0.88;
    const strand = new Path2D();
    samples.forEach((p, i) => {
      const drift = Math.sin(i * 0.37 + fibre * 2.4) * diameter * 0.025;
      const x = p.x + p.nx * (offset + drift),
        y = p.y + p.ny * (offset + drift);
      if (i === 0) strand.moveTo(x, y);
      else strand.lineTo(x, y);
    });
    ctx.strokeStyle =
      fibre % 3 === 0 ? "rgba(255,255,255,.24)" : "rgba(44,30,20,.13)";
    ctx.lineWidth = fibre % 3 === 0 ? 0.55 : 0.38;
    ctx.stroke(strand);
  }
  // Sparse flyaway fibres, deterministic so redraws do not shimmer.
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 0.4;
  for (let i = 3; i < samples.length - 2; i += 5) {
    const p = samples[i],
      q = samples[i + 2],
      side = i % 2 ? 1 : -1;
    const a = diameter * 0.44 * side,
      b = diameter * (0.55 + 0.06 * Math.sin(i)) * side;
    ctx.beginPath();
    ctx.moveTo(p.x + p.nx * a, p.y + p.ny * a);
    ctx.quadraticCurveTo(
      p.x + p.nx * b,
      p.y + p.ny * b,
      q.x + q.nx * a,
      q.y + q.ny * a,
    );
    ctx.stroke();
  }
  ctx.restore();
}
