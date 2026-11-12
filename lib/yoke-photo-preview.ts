import type { ChartDocument } from "./chart";
import { yokeFabric } from "./yoke-fabric-preview";
import { calculateYokeTargets } from "./yoke-plan";

type RGB = [number, number, number];
type Raster = { data: Uint8ClampedArray; width: number; height: number };
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// Photo-space landmarks at the base of the collar. Extend the curve past
// the neckline so its parallel rounds can meet the shoulder silhouette.
const collar = [
  [0, 153],
  [60, 148],
  [100, 137],
  [138, 117],
  [160, 93],
  [176, 67],
  [188, 40],
  [194, 26],
  [240, -85],
] as const;

export function distanceFromPhotoCollar(x: number, y: number) {
  x = Math.abs(x);
  let nearest = Infinity;
  let sign = 1;
  for (let i = 1; i < collar.length; i++) {
    const [ax, ay] = collar[i - 1];
    const [bx, by] = collar[i];
    const dx = bx - ax;
    const dy = by - ay;
    const along = clamp(
      ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    const d = (x - ax - along * dx) ** 2 + (y - ay - along * dy) ** 2;
    if (d < nearest) {
      nearest = d;
      sign = y - ay - ((x - ax) * dy) / dx < 0 ? -1 : 1;
    }
  }
  return sign * Math.sqrt(nearest);
}

const PHOTO_CHEST_CIRCUMFERENCE = 1560;
const MAX_PHOTO_YOKE_DEPTH_RATIO = 0.3;

export function photoStitchPitch(document: ChartDocument) {
  const plan = calculateYokeTargets(document.yoke!.measurements);
  const stitch = PHOTO_CHEST_CIRCUMFERENCE / plan.body;
  return {
    stitch,
    row: stitch * (document.gaugeStitches / document.gaugeRows),
  };
}

/** The fixed flat lay has a finite distance from neckline to sleeve split. */
export const SWEATER_PREVIEW_TOO_DEEP =
  "This sweater template doesn’t fit your yoke proportions. You can still use the whole-yoke and half-yoke views.";

export function fitsSweaterPhoto(document: ChartDocument) {
  if (!document.yoke) return false;
  const { actualDepth, actualBody } = calculateYokeTargets(
    document.yoke.measurements,
  );
  // Unit conversion and gauge can round an exact boundary a few ulps up.
  return (
    actualDepth / actualBody <= MAX_PHOTO_YOKE_DEPTH_RATIO + 8 * Number.EPSILON
  );
}

const ARC_STEPS = 48;
const EDGE_SAMPLES = 4;

// Each round is an offset of the collar. Measure its path, not its horizontal
// projection: a pixel of width represents more fabric near a sloped shoulder.
function courseArc(half: number, distance: number) {
  const lengths = new Float32Array(ARC_STEPS + 1);
  const step = half / ARC_STEPS;
  let previousY = 153 + distance;
  for (let i = 1; i <= ARC_STEPS; i++) {
    let top = -85;
    let bottom = 153 + distance;
    for (let j = 0; j < 14; j++) {
      const mid = (top + bottom) / 2;
      if (distanceFromPhotoCollar(i * step, mid) < distance) top = mid;
      else bottom = mid;
    }
    const y = (top + bottom) / 2;
    lengths[i] = lengths[i - 1] + Math.hypot(step, y - previousY);
    previousY = y;
  }
  return lengths;
}

export function photoCoursePosition(horizontal: number, lengths: Float32Array) {
  const end = lengths.length - 1;
  const index = clamp(Math.abs(horizontal) * end, 0, end);
  const left = Math.min(end - 1, Math.floor(index));
  const arc =
    lengths[left] + (index - left) * (lengths[left + 1] - lengths[left]);
  return Math.sign(horizontal) * (arc / lengths[end]);
}

// Top edges of the two cuffs, traced independently from the template.
const leftCuff = [
  [50, 843],
  [102, 848],
  [153, 856],
  [201, 869],
] as const;
const rightCuff = [
  [1318, 877],
  [1366, 861],
  [1416, 850],
  [1477, 843],
] as const;

/** Trace the upper sleeve split down to the underarm, then the body edge.
 * Blend the texture only across this narrow join, not across the sleeve cap. */
export function photoSleeveWeight(dx: number, y: number) {
  const upper = clamp((y - 165) / 215, 0, 1);
  const lower = clamp((y - 380) / 230, 0, 1);
  const split = 241 + 112 * upper + 37 * lower;
  const t = clamp((Math.abs(dx) - split + 18) / 36, 0, 1);
  return t * t * (3 - 2 * t);
}

export function photoDetailWeight(x: number, y: number) {
  const dx = x - 768;
  // Preserve the visible back-neck purls as well as the front collar.
  if (Math.abs(dx) < 194 && y < 153 && distanceFromPhotoCollar(dx, y) < 0)
    return 1;
  const cuff = x < 224 ? leftCuff : x > 1310 ? rightCuff : undefined;
  if (cuff && y > 840) {
    let seam: number = cuff[0][1];
    for (let i = 1; i < cuff.length; i++) {
      const [left, top] = cuff[i - 1];
      const [right, bottom] = cuff[i];
      seam = top + clamp((x - left) / (right - left), 0, 1) * (bottom - top);
      if (x <= right) break;
    }
    return clamp((y - seam) / 4, 0, 1);
  }
  return Math.abs(dx) < 395 ? clamp((y - 900) / 24, 0, 1) : 0;
}

/** Paint one continuous knitted surface from our merino relief. The sweater
 * photo contributes its silhouette, lighting, and original ribbed edges. */
export function renderSweaterPhoto(
  photo: Raster,
  lighting: Uint8ClampedArray,
  relief: Raster,
  document: ChartDocument,
) {
  const project = document.yoke;
  if (!project) throw new Error("This chart has no yoke.");
  const { data, width, height } = photo;
  const plan = calculateYokeTargets(project.measurements);
  const fabric = yokeFabric(document, "front", 0, false);
  const colours = new Map(project.palette.map((hex) => [hex, rgb(hex)]));
  const main = rgb(project.palette[0]);
  const rounds = fabric.rows
    .slice(0, plan.rounds)
    .reverse()
    .map((row) =>
      row
        .toSorted((a, b) => b.packed - a.packed)
        .map((loop) => colours.get(loop.yarn ?? "") ?? main),
    );
  const pitch = photoStitchPitch(document);
  const courseAt = new Float32Array(width * height);
  courseAt.fill(-1);
  const spans = new Float32Array(rounds.length * EDGE_SAMPLES);

  for (let y = 0; y < height; y++) {
    const py = ((y + 0.5) / height) * 1024;
    if (py > 153 + pitch.row * rounds.length) break;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const alpha = data[index * 4 + 3];
      if (!alpha) continue;
      const dx = ((x + 0.5) / width) * 1536 - 768;
      const course = distanceFromPhotoCollar(dx, py) / pitch.row;
      if (course < 0 || course >= rounds.length) continue;
      courseAt[index] = course;
      const band = Math.floor(course * EDGE_SAMPLES);
      if (alpha > 220) spans[band] = Math.max(spans[band], Math.abs(dx));
    }
  }
  const arcs = rounds.map((_, r) => {
    const half = Math.max(
      ...spans.subarray(r * EDGE_SAMPLES, (r + 1) * EDGE_SAMPLES),
    );
    return half ? courseArc(half, (r + 0.5) * pitch.row) : undefined;
  });

  // A constant-size relief tile represents four stitches by four rows, just
  // like the normal knitted preview. Changing gauge changes its repeat pitch.
  const wrap = (v: number) => ((v % 4) + 4) % 4;
  const sampleRelief = (stitch: number, row: number) => {
    const tx = Math.floor((wrap(stitch) / 4) * relief.width);
    const ty = Math.floor((wrap(row) / 4) * relief.height);
    return relief.data[(ty * relief.width + tx) * 4] - 127;
  };
  for (let y = 0; y < height; y++) {
    const py = ((y + 0.5) / height) * 1024;
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const i = index * 4;
      if (!data[i + 3]) continue;
      const dx = ((x + 0.5) / width) * 1536 - 768;
      const course = courseAt[index];
      const rib = photoDetailWeight(dx + 768, py);
      let colour = main;
      let stitch = dx / pitch.stitch;
      let row = py / pitch.row;
      let fibre: number;
      if (course >= 0 && rib === 0) {
        const r = Math.floor(course);
        const stitches = rounds[r];
        const band = Math.floor(course * EDGE_SAMPLES);
        const span = spans[band];
        const arc = arcs[r];
        if (stitches.length && span && arc) {
          const along = photoCoursePosition(dx / span, arc);
          stitch = clamp(
            ((along + 1) / 2) * stitches.length,
            0,
            stitches.length - 0.0001,
          );
          row = course;
          colour = stitches[Math.floor(stitch)];
        }
        fibre = sampleRelief(stitch, row);
      } else {
        const sleeve = photoSleeveWeight(dx, py);
        const angle = Math.sign(dx) * 0.43;
        const sleeveStitch =
          (dx * Math.cos(angle) - py * Math.sin(angle)) / pitch.stitch;
        const sleeveRow =
          (py * Math.cos(angle) + dx * Math.sin(angle)) / pitch.row;
        fibre =
          sampleRelief(stitch, row) * (1 - sleeve) +
          sampleRelief(sleeveStitch, sleeveRow) * sleeve;
      }
      const light = lighting[i] / 140;
      const originalLight = data[i] / 140;
      for (let c = 0; c < 3; c++) {
        const knit =
          colour[c] * (light ** 0.85 + fibre * 0.009) +
          Math.max(0, fibre) * 0.32;
        const photoRib =
          colour[c] * originalLight ** 0.85 +
          Math.max(0, originalLight - 1) * 23;
        data[i + c] = knit * (1 - rib) + photoRib * rib;
      }
    }
  }
}
