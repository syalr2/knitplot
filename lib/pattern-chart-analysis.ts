import { type PaletteColor, type StitchAction } from "./chart";
export type SymbolMeaning =
  | "main"
  | "pattern"
  | "purl"
  | "no-stitch"
  | "cast-on"
  | "m1l"
  | "m1r"
  | "kfb"
  | "inc"
  | "ssk"
  | "k2tog"
  | "cdd"
  | "dec"
  | "bind-off";
export type CropRect = { x: number; y: number; width: number; height: number };
export type SourceImage = {
  url: string;
  width: number;
  height: number;
  label: string;
};
export type SymbolSample = { index: number; sampleUrl: string };
export type SymbolGroup = {
  id: number;
  count: number;
  samples: SymbolSample[];
  darkness: number;
};
export type Analysis = {
  assignments: number[];
  colorAssignments: number[];
  baseColors: number[][];
  features: number[][];
  groups: SymbolGroup[];
  sourcePreviewUrl: string;
};
export type SymbolDefinition = {
  id: number;
  meaning: SymbolMeaning;
  sampleIndices: number[];
};
export type GridFit = { crop: CropRect; confidence: number };

export type PdfPage = {
  getViewport(input: { scale: number }): { width: number; height: number };
  render(input: {
    canvasContext: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    viewport: unknown;
  }): { promise: Promise<void> };
};

export type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

export const DEFAULT_CROP: CropRect = { x: 5, y: 5, width: 90, height: 75 };
export const FEATURE_SIDE = 12;
export const FEATURE_PIXELS = FEATURE_SIDE * FEATURE_SIDE;
export const MATCHING_SYMBOL_THRESHOLD = 0.018;
export const SYMBOL_OPTIONS: Array<{ value: SymbolMeaning; label: string }> = [
  { value: "main", label: "Main colour · knit" },
  { value: "pattern", label: "Contrast colour · knit" },
  { value: "purl", label: "Purl stitch" },
  { value: "no-stitch", label: "No stitch · skip" },
  { value: "cast-on", label: "Cast on · CO" },
  { value: "m1l", label: "Increase · M1L" },
  { value: "m1r", label: "Increase · M1R" },
  { value: "kfb", label: "Increase · kfb" },
  { value: "inc", label: "Increase · generic" },
  { value: "ssk", label: "Decrease · SSK" },
  { value: "k2tog", label: "Decrease · k2tog" },
  { value: "cdd", label: "Decrease · centred double" },
  { value: "dec", label: "Decrease · generic" },
  { value: "bind-off", label: "Bind off · BO" },
];
export const DEFAULT_CATEGORY_MEANINGS: SymbolMeaning[] = [
  "main",
  "pattern",
  "m1l",
  "m1r",
  "purl",
  "no-stitch",
  "cast-on",
  "bind-off",
  "ssk",
  "k2tog",
  "kfb",
  "cdd",
  "inc",
  "dec",
];

export function meaningAction(meaning: SymbolMeaning): StitchAction {
  return meaning === "main" || meaning === "pattern" ? "knit" : meaning;
}

export function previewActionSymbol(action: StitchAction) {
  return action === "purl"
    ? "P"
    : action === "no-stitch"
      ? "—"
      : action === "cast-on"
        ? "CO"
        : action === "bind-off"
          ? "BO"
          : action === "m1l"
            ? "L"
            : action === "m1r"
              ? "R"
              : action === "kfb"
                ? "FB"
                : action === "inc"
                  ? "+"
                  : action === "ssk"
                    ? "S"
                    : action === "k2tog"
                      ? "2"
                      : action === "cdd"
                        ? "C"
                        : action === "dec"
                          ? "−"
                          : "";
}

export async function destroyPdf(pdf: PdfDocument | null) {
  if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("That page image could not be opened."));
    image.src = url;
  });
}

export function featureImage(feature: number[]) {
  const canvas = window.document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.imageSmoothingEnabled = false;
  for (let row = 0; row < FEATURE_SIDE; row += 1) {
    for (let column = 0; column < FEATURE_SIDE; column += 1) {
      const value = Math.round(feature[row * FEATURE_SIDE + column] * 255);
      context.fillStyle = `rgb(${value}, ${value}, ${value})`;
      context.fillRect(column * 6, row * 6, 6, 6);
    }
  }
  return canvas.toDataURL("image/png");
}

export function symbolDistance(first: number[], second: number[]) {
  let total = 0;
  for (let index = 0; index < FEATURE_PIXELS; index += 1) {
    const difference = first[index] - second[index];
    total += difference * difference;
  }
  return total / FEATURE_PIXELS;
}

export function symbolInk(feature: number[]) {
  return (
    feature
      .slice(0, FEATURE_PIXELS)
      .reduce((total, value) => total + (1 - value), 0) / FEATURE_PIXELS
  );
}

export async function chartFeatures(
  source: SourceImage,
  crop: CropRect,
  columns: number,
  rows: number,
) {
  const image = await loadImage(source.url);
  const cellSize = 32;
  const canvas = window.document.createElement("canvas");
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The chart could not be analysed.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    (image.naturalWidth * crop.x) / 100,
    (image.naturalHeight * crop.y) / 100,
    (image.naturalWidth * crop.width) / 100,
    (image.naturalHeight * crop.height) / 100,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const features: number[][] = [];
  const baseColors: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pixels = context.getImageData(
        column * cellSize,
        row * cellSize,
        cellSize,
        cellSize,
      ).data;
      const backgroundSamples: number[][] = [];
      for (let y = 5; y < cellSize - 5; y += 2) {
        for (let x = 5; x < cellSize - 5; x += 2) {
          if (x > 8 && x < cellSize - 9 && y > 8 && y < cellSize - 9) continue;
          const offset = (y * cellSize + x) * 4;
          backgroundSamples.push([
            pixels[offset] / 255,
            pixels[offset + 1] / 255,
            pixels[offset + 2] / 255,
          ]);
        }
      }
      const background = [0, 1, 2].map((channel) => {
        const values = backgroundSamples
          .map((sample) => sample[channel])
          .sort((first, second) => first - second);
        return values[Math.floor(values.length / 2)] ?? 1;
      });
      baseColors.push(background);

      const normalizedSymbol: number[] = [];
      for (let sampleRow = 0; sampleRow < FEATURE_SIDE; sampleRow += 1) {
        for (
          let sampleColumn = 0;
          sampleColumn < FEATURE_SIDE;
          sampleColumn += 1
        ) {
          const sourceX = Math.round(
            5 + (sampleColumn * (cellSize - 11)) / (FEATURE_SIDE - 1),
          );
          const sourceY = Math.round(
            5 + (sampleRow * (cellSize - 11)) / (FEATURE_SIDE - 1),
          );
          let difference = 0;
          let samples = 0;
          for (
            let y = sourceY;
            y < Math.min(cellSize - 4, sourceY + 2);
            y += 1
          ) {
            for (
              let x = sourceX;
              x < Math.min(cellSize - 4, sourceX + 2);
              x += 1
            ) {
              const offset = (y * cellSize + x) * 4;
              const red = pixels[offset] / 255 - background[0];
              const green = pixels[offset + 1] / 255 - background[1];
              const blue = pixels[offset + 2] / 255 - background[2];
              difference +=
                Math.sqrt(red * red + green * green + blue * blue) /
                Math.sqrt(3);
              samples += 1;
            }
          }
          const ink = samples ? clamp((difference / samples) * 2.4, 0, 1) : 0;
          normalizedSymbol.push(1 - ink);
        }
      }
      features.push(normalizedSymbol);
    }
  }
  const previewCanvas = window.document.createElement("canvas");
  const previewSourceWidth = Math.max(
    1,
    (image.naturalWidth * crop.width) / 100,
  );
  const previewSourceHeight = Math.max(
    1,
    (image.naturalHeight * crop.height) / 100,
  );
  const previewScale = Math.min(
    1,
    1600 / Math.max(previewSourceWidth, previewSourceHeight),
  );
  previewCanvas.width = Math.max(
    1,
    Math.round(previewSourceWidth * previewScale),
  );
  previewCanvas.height = Math.max(
    1,
    Math.round(previewSourceHeight * previewScale),
  );
  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext)
    throw new Error("The chart preview could not be prepared.");
  previewContext.fillStyle = "#ffffff";
  previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewContext.drawImage(
    image,
    (image.naturalWidth * crop.x) / 100,
    (image.naturalHeight * crop.y) / 100,
    (image.naturalWidth * crop.width) / 100,
    (image.naturalHeight * crop.height) / 100,
    0,
    0,
    previewCanvas.width,
    previewCanvas.height,
  );
  return {
    features,
    baseColors,
    sourcePreviewUrl: previewCanvas.toDataURL("image/png"),
  };
}

export function colorDistance(first: number[], second: number[]) {
  return Math.sqrt(
    first.reduce(
      (total, value, index) => total + (value - second[index]) ** 2,
      0,
    ),
  );
}

export function colorSwatch(color: number[]) {
  return `rgb(${color.map((channel) => Math.round(channel * 255)).join(", ")})`;
}

export function classifyBaseColors(colors: number[][]) {
  if (!colors.length)
    return {
      assignments: [],
      centers: [
        [1, 1, 1],
        [0, 0, 0],
      ],
    };
  let first = colors.reduce(
    (lightest, color) =>
      color.reduce((total, value) => total + value, 0) >
      lightest.reduce((total, value) => total + value, 0)
        ? color
        : lightest,
    colors[0],
  );
  let second = colors.reduce(
    (darkest, color) =>
      color.reduce((total, value) => total + value, 0) <
      darkest.reduce((total, value) => total + value, 0)
        ? color
        : darkest,
    colors[0],
  );
  let assignments = new Array(colors.length).fill(0);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    assignments = colors.map((color) =>
      colorDistance(color, first) <= colorDistance(color, second) ? 0 : 1,
    );
    const firstMembers = colors.filter((_, index) => assignments[index] === 0);
    const secondMembers = colors.filter((_, index) => assignments[index] === 1);
    if (firstMembers.length)
      first = first.map(
        (_, channel) =>
          firstMembers.reduce((total, color) => total + color[channel], 0) /
          firstMembers.length,
      );
    if (secondMembers.length)
      second = second.map(
        (_, channel) =>
          secondMembers.reduce((total, color) => total + color[channel], 0) /
          secondMembers.length,
      );
  }
  if (colorDistance(first, second) < 0.08)
    return {
      assignments: new Array(colors.length).fill(0),
      centers: [first, second],
    };
  const firstCount = assignments.filter(
    (assignment) => assignment === 0,
  ).length;
  const secondCount = assignments.length - firstCount;
  if (secondCount > firstCount) {
    assignments = assignments.map((assignment) => (assignment === 0 ? 1 : 0));
    return { assignments, centers: [second, first] };
  }
  return { assignments, centers: [first, second] };
}

export function profileValueAt(profile: number[], position: number) {
  const center = Math.round(position);
  let strongest = 0;
  for (let offset = -2; offset <= 2; offset += 1) {
    strongest = Math.max(strongest, profile[center + offset] ?? 0);
  }
  return strongest;
}

export function likelyBoundaryPositions(
  profile: number[],
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const candidates: Array<{ position: number; strength: number }> = [];
  const start = Math.max(0, Math.floor(minimum));
  const end = Math.min(profile.length - 1, Math.ceil(maximum));
  for (let position = start; position <= end; position += 1) {
    const strength = profileValueAt(profile, position);
    if (
      strength >= (profile[position - 1] ?? 0) &&
      strength >= (profile[position + 1] ?? 0)
    ) {
      candidates.push({ position, strength });
    }
  }
  candidates.sort((first, second) => second.strength - first.strength);
  const selected: number[] = [
    clamp(Math.round(fallback), start, end),
    start,
    end,
  ];
  for (const candidate of candidates) {
    if (
      selected.every((position) => Math.abs(position - candidate.position) > 2)
    )
      selected.push(candidate.position);
    if (selected.length >= 64) break;
  }
  return selected;
}

export function fitKnownGridAxis(
  profile: number[],
  roughStart: number,
  roughEnd: number,
  cells: number,
) {
  const roughSpan = Math.max(cells * 2, roughEnd - roughStart);
  const roughCell = roughSpan / cells;
  const searchDistance = Math.max(6, roughCell * 2.5, roughSpan * 0.1);
  const starts = likelyBoundaryPositions(
    profile,
    roughStart - searchDistance,
    roughStart + searchDistance,
    roughStart,
  );
  const ends = likelyBoundaryPositions(
    profile,
    roughEnd - searchDistance,
    roughEnd + searchDistance,
    roughEnd,
  );
  const baseline =
    profile.reduce((total, value) => total + value, 0) /
    Math.max(1, profile.length);
  let best = {
    start: roughStart,
    end: roughEnd,
    score: Number.NEGATIVE_INFINITY,
    raw: 0,
  };

  for (const start of starts) {
    for (const end of ends) {
      if (end <= start) continue;
      const period = (end - start) / cells;
      if (period < 2 || period < roughCell * 0.72 || period > roughCell * 1.28)
        continue;
      let score = 0;
      let raw = 0;
      for (let boundary = 0; boundary <= cells; boundary += 1) {
        const position = start + boundary * period;
        const lineStrength = profileValueAt(profile, position);
        const nearby =
          (profileValueAt(profile, position - period * 0.34) +
            profileValueAt(profile, position + period * 0.34)) /
          2;
        const contrast = Math.max(0, lineStrength - nearby);
        const weight = boundary === 0 || boundary === cells ? 1.35 : 1;
        score += (lineStrength + contrast * 1.25) * weight;
        raw += lineStrength;
      }
      const edgeDrift =
        (Math.abs(start - roughStart) + Math.abs(end - roughEnd)) /
        Math.max(1, roughSpan);
      score = score / (cells + 1.7) - edgeDrift * 0.025;
      if (score > best.score)
        best = { start, end, score, raw: raw / (cells + 1) };
    }
  }

  const confidence = clamp(
    (best.raw - baseline) / Math.max(0.08, 1 - baseline),
    0,
    1,
  );
  return { start: best.start, end: best.end, confidence };
}

export async function snapKnownGrid(
  source: SourceImage,
  crop: CropRect,
  columns: number,
  rows: number,
): Promise<GridFit> {
  const image = await loadImage(source.url);
  const cropWidth = (image.naturalWidth * crop.width) / 100;
  const cropHeight = (image.naturalHeight * crop.height) / 100;
  const desiredScale = Math.max(
    1,
    (columns * 12) / Math.max(1, cropWidth),
    (rows * 12) / Math.max(1, cropHeight),
  );
  const scale = Math.min(
    4,
    desiredScale,
    3200 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(50, Math.round(image.naturalWidth * scale));
  const height = Math.max(50, Math.round(image.naturalHeight * scale));
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The grid could not be aligned.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  function lineProfile(axis: "x" | "y", crossStart: number, crossEnd: number) {
    const length = axis === "x" ? width : height;
    const crossLength = axis === "x" ? height : width;
    const from = clamp(Math.floor(crossStart), 0, crossLength - 1);
    const to = clamp(Math.ceil(crossEnd), from + 1, crossLength);
    const stride = Math.max(1, Math.floor((to - from) / 900));
    const lineScores = new Array<number>(length).fill(0);
    for (let position = 0; position < length; position += 1) {
      let darkness = 0;
      let continuous = 0;
      let samples = 0;
      for (let cross = from; cross < to; cross += stride) {
        const x = axis === "x" ? position : cross;
        const y = axis === "x" ? cross : position;
        const offset = (y * width + x) * 4;
        const luminance =
          pixels[offset] * 0.299 +
          pixels[offset + 1] * 0.587 +
          pixels[offset + 2] * 0.114;
        darkness += Math.max(0, (242 - luminance) / 242);
        if (luminance < 218) continuous += 1;
        samples += 1;
      }
      lineScores[position] = samples
        ? (darkness / samples) * 0.55 + (continuous / samples) * 0.45
        : 0;
    }
    return lineScores;
  }

  const roughLeft = (crop.x / 100) * width;
  const roughRight = ((crop.x + crop.width) / 100) * width;
  const roughTop = (crop.y / 100) * height;
  const roughBottom = ((crop.y + crop.height) / 100) * height;
  const horizontal = fitKnownGridAxis(
    lineProfile("x", roughTop, roughBottom),
    roughLeft,
    roughRight,
    columns,
  );
  const vertical = fitKnownGridAxis(
    lineProfile("y", horizontal.start, horizontal.end),
    roughTop,
    roughBottom,
    rows,
  );
  const refinedHorizontal = fitKnownGridAxis(
    lineProfile("x", vertical.start, vertical.end),
    horizontal.start,
    horizontal.end,
    columns,
  );
  const snapped: CropRect = {
    x: clamp((refinedHorizontal.start / width) * 100, 0, 100),
    y: clamp((vertical.start / height) * 100, 0, 100),
    width: clamp(
      ((refinedHorizontal.end - refinedHorizontal.start) / width) * 100,
      0.1,
      100,
    ),
    height: clamp(((vertical.end - vertical.start) / height) * 100, 0.1, 100),
  };
  snapped.width = Math.min(snapped.width, 100 - snapped.x);
  snapped.height = Math.min(snapped.height, 100 - snapped.y);
  return {
    crop: snapped,
    confidence: (refinedHorizontal.confidence + vertical.confidence) / 2,
  };
}

export function importedCells(
  analysis: Analysis,
  meanings: Record<number, SymbolMeaning>,
  overrides: Record<number, SymbolMeaning>,
  columns: number,
  rows: number,
  firstRow: "bottom" | "top",
  palette: PaletteColor[],
) {
  const cells: string[][] = [];
  const stitchActions: StitchAction[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const cellRow: string[] = [];
    const actionRow: StitchAction[] = [];
    for (let column = 0; column < columns; column += 1) {
      const cellIndex = row * columns + column;
      const group = analysis.assignments[cellIndex];
      const meaning = overrides[cellIndex] ?? meanings[group] ?? "main";
      const colorMeaning =
        meaning === "main" || meaning === "pattern"
          ? meaning
          : analysis.colorAssignments[cellIndex] === 1
            ? "pattern"
            : "main";
      cellRow.push(colorMeaning === "pattern" ? palette[1].id : palette[0].id);
      actionRow.push(meaningAction(meaning));
    }
    cells.push(cellRow);
    stitchActions.push(actionRow);
  }
  if (firstRow === "top") {
    cells.reverse();
    stitchActions.reverse();
  }
  return { cells, stitchActions };
}
