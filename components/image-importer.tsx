"use client";

import { ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { cellAspectRatio, ChartDocument, PaletteColor } from "@/lib/chart";

export type FitMode = "cover" | "contain";
export type ColorCountChoice = number | { min: number; max: number };
type SizeMode = "current" | "image";
type PaletteMode = "image" | "existing";
type Rgb = [number, number, number];
export type CropPosition = { x: number; y: number };

type Props = {
  document: ChartDocument;
  onImport: (palette: PaletteColor[], cells: string[][]) => void;
};

function distanceSquared(first: Rgb, second: Rgb) {
  const red = first[0] - second[0];
  const green = first[1] - second[1];
  const blue = first[2] - second[2];
  return red * red + green * green + blue * blue;
}

function rgbToHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function chooseStartingCenters(samples: Rgb[], count: number) {
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();

  for (const [red, green, blue] of samples) {
    const key = `${Math.floor(red / 16)}:${Math.floor(green / 16)}:${Math.floor(blue / 16)}`;
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }

  const minimumUsefulSize = samples.length >= 1000 ? Math.max(2, Math.floor(samples.length * 0.0005)) : 1;
  let candidates = Array.from(buckets.values())
    .filter((bucket) => bucket.count >= minimumUsefulSize)
    .map((bucket) => ({
      color: [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count] as Rgb,
      count: bucket.count,
    }))
    .sort((first, second) => second.count - first.count);

  if (candidates.length < count) {
    candidates = Array.from(buckets.values())
      .map((bucket) => ({
        color: [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count] as Rgb,
        count: bucket.count,
      }))
      .sort((first, second) => second.count - first.count);
  }

  const centers: Rgb[] = [[...candidates[0].color] as Rgb];

  while (centers.length < count && centers.length < candidates.length) {
    let best = candidates[0];
    let bestScore = -1;

    for (const candidate of candidates) {
      const nearestDistance = Math.min(...centers.map((center) => distanceSquared(candidate.color, center)));
      const score = nearestDistance * (1 + Math.log2(candidate.count + 1));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (bestScore <= 0) break;
    centers.push([...best.color] as Rgb);
  }

  return centers;
}

function dominantCellColor(
  pixels: Uint8ClampedArray,
  sampleWidth: number,
  startX: number,
  startY: number,
  cellWidth: number,
  cellHeight: number,
) {
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const offset = (((startY + y) * sampleWidth) + startX + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const key = `${red >> 5}:${green >> 5}:${blue >> 5}`;
      const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      buckets.set(key, bucket);
    }
  }

  let dominant = buckets.values().next().value as { count: number; red: number; green: number; blue: number };
  for (const bucket of buckets.values()) {
    if (bucket.count > dominant.count) dominant = bucket;
  }

  return [dominant.red / dominant.count, dominant.green / dominant.count, dominant.blue / dominant.count] as Rgb;
}

function reduceColors(samples: Rgb[], requestedCount: number) {
  let centers = chooseStartingCenters(samples, requestedCount);
  let assignments = new Array(samples.length).fill(0);

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const totals = centers.map(() => [0, 0, 0, 0]);

    assignments = samples.map((sample) => {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = distanceSquared(sample, center);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      totals[nearest][0] += sample[0];
      totals[nearest][1] += sample[1];
      totals[nearest][2] += sample[2];
      totals[nearest][3] += 1;
      return nearest;
    });

    centers = centers.map((center, index) => {
      const total = totals[index];
      return total[3]
        ? [total[0] / total[3], total[1] / total[3], total[2] / total[3]] as Rgb
        : center;
    });
  }

  const counts = centers.map(() => 0);
  assignments.forEach((assignment) => { counts[assignment] += 1; });
  const clusters = centers
    .map((center, index) => ({ center, count: counts[index], oldIndex: index }))
    .filter((cluster) => cluster.count > 0)
    .sort((first, second) => second.count - first.count);

  const oldToNew = new Map(clusters.map((cluster, index) => [cluster.oldIndex, index]));
  const sortedAssignments = assignments.map((assignment) => oldToNew.get(assignment) ?? 0);

  if (clusters.length === 1) {
    const [red, green, blue] = clusters[0].center;
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    clusters.push({
      center: luminance > 128 ? [0, 0, 0] : [255, 255, 255],
      count: 0,
      oldIndex: -1,
    });
  }

  return { colors: clusters.map((cluster) => cluster.center), assignments: sortedAssignments };
}

function reductionError(samples: Rgb[], reduction: ReturnType<typeof reduceColors>) {
  return samples.reduce((total, sample, index) => {
    const color = reduction.colors[reduction.assignments[index]];
    return total + distanceSquared(sample, color);
  }, 0);
}

function reduceColorsForChoice(samples: Rgb[], choice: ColorCountChoice) {
  if (typeof choice === "number") return reduceColors(samples, choice);

  let selected = reduceColors(samples, choice.min);
  let previousError = reductionError(samples, selected);

  for (let count = choice.min + 1; count <= choice.max; count += 1) {
    const candidate = reduceColors(samples, count);
    const candidateError = reductionError(samples, candidate);
    const improvement = previousError > 0 ? (previousError - candidateError) / previousError : 0;

    if (improvement < 0.1) break;
    selected = candidate;
    previousError = candidateError;
  }

  return selected;
}

function drawFittedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fit: FitMode,
  position: CropPosition,
  zoom: number,
) {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  const targetAspect = width / height;

  if (fit === "cover") {
    let baseWidth = image.naturalWidth;
    let baseHeight = image.naturalHeight;
    if (sourceAspect > targetAspect) {
      baseWidth = image.naturalHeight * targetAspect;
    } else {
      baseHeight = image.naturalWidth / targetAspect;
    }
    const sourceWidth = baseWidth / zoom;
    const sourceHeight = baseHeight / zoom;
    const sourceX = (image.naturalWidth - sourceWidth) * (position.x / 100);
    const sourceY = (image.naturalHeight - sourceHeight) * (position.y / 100);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    return;
  }

  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function CropPreview({
  image,
  aspect,
  fit,
  position,
  zoom,
  onPositionChange,
}: {
  image: HTMLImageElement;
  aspect: number;
  fit: FitMode;
  position: CropPosition;
  zoom: number;
  onPositionChange: (position: CropPosition) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; position: CropPosition } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maximum = 800;
    canvas.width = Math.max(1, Math.round(aspect >= 1 ? maximum : maximum * aspect));
    canvas.height = Math.max(1, Math.round(aspect >= 1 ? maximum / aspect : maximum));
    const context = canvas.getContext("2d");
    if (!context) return;
    drawFittedImage(context, image, canvas.width, canvas.height, fit, position, zoom);
  }, [aspect, fit, image, position, zoom]);

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (fit !== "cover") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, position };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || fit !== "cover") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onPositionChange({
      x: Math.max(0, Math.min(100, drag.position.x - ((event.clientX - drag.clientX) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, drag.position.y - ((event.clientY - drag.clientY) / bounds.height) * 100)),
    });
  }

  return (
    <canvas
      ref={canvasRef}
      className={fit === "cover" ? "crop-canvas draggable" : "crop-canvas"}
      role="img"
      aria-label="Image crop preview"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
    />
  );
}

export function convertImage(
  image: HTMLImageElement,
  document: ChartDocument,
  colorCount: ColorCountChoice,
  fit: FitMode,
  position: CropPosition,
  zoom: number,
  paletteMode: PaletteMode = "image",
) {
  const cellHeight = 8;
  const cellWidth = Math.max(1, Math.round(cellHeight * cellAspectRatio(document)));
  const sampleWidth = document.width * cellWidth;
  const sampleHeight = document.height * cellHeight;
  const canvas = window.document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not process this image.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawFittedImage(context, image, sampleWidth, sampleHeight, fit, position, zoom);

  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const samples: Rgb[] = [];

  for (let row = 0; row < document.height; row += 1) {
    for (let column = 0; column < document.width; column += 1) {
      samples.push(dominantCellColor(
        pixels,
        sampleWidth,
        column * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight,
      ));
    }
  }

  if (paletteMode === "existing") {
    const existingColors = document.palette.map((color) => hexToRgb(color.hex));
    const cells = Array.from({ length: document.height }, (_, row) =>
      Array.from({ length: document.width }, (_, column) => {
        const sample = samples[row * document.width + column];
        let nearest = 0;
        existingColors.forEach((color, index) => {
          if (distanceSquared(sample, color) < distanceSquared(sample, existingColors[nearest])) nearest = index;
        });
        return document.palette[nearest].id;
      }),
    );
    return { palette: document.palette.map((color) => ({ ...color })), cells };
  }

  const reduced = reduceColorsForChoice(samples, colorCount);
  const importKey = Date.now();
  const palette = reduced.colors.map((color, index) => ({
    id: `import-${importKey}-${index}`,
    hex: rgbToHex(color),
  }));
  const cells = Array.from({ length: document.height }, (_, row) =>
    Array.from({ length: document.width }, (_, column) => {
      const assignment = reduced.assignments[row * document.width + column];
      return palette[assignment].id;
    }),
  );

  return { palette, cells };
}

export function ImageImporter({ document, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef<string | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fit, setFit] = useState<FitMode>("cover");
  const [sizeMode, setSizeMode] = useState<SizeMode>("current");
  const [targetWidth, setTargetWidth] = useState(document.width);
  const [cropPosition, setCropPosition] = useState<CropPosition>({ x: 50, y: 50 });
  const [cropZoom, setCropZoom] = useState(1);
  const [colorCount, setColorCount] = useState(Math.min(5, Math.max(2, document.palette.length)));
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("image");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function releaseImage() {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    setImage(null);
    setPreviewUrl(null);
    setError("");
  }

  useEffect(() => () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") releaseImage();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewUrl]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, or WebP image smaller than 10 MB.");
      return;
    }

    releaseImage();
    setTargetWidth(document.width);
    setSizeMode("current");
    setFit("cover");
    setCropPosition({ x: 50, y: 50 });
    setCropZoom(1);
    setPaletteMode("image");
    setLoading(true);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setPreviewUrl(url);
      setLoading(false);
    };
    nextImage.onerror = () => {
      setLoading(false);
      setError("That image could not be opened.");
      URL.revokeObjectURL(url);
      imageUrlRef.current = null;
    };
    nextImage.src = url;
  }

  function createChart() {
    if (!image) return;
    try {
      const targetDocument = { ...document, width: finalWidth, height: finalHeight };
      const result = convertImage(image, targetDocument, colorCount, fit, cropPosition, cropZoom, paletteMode);
      onImport(result.palette, result.cells);
      releaseImage();
    } catch {
      setError("The image could not be converted. Please try another file.");
    }
  }

  const imageAspect = image ? image.naturalWidth / image.naturalHeight : 1;
  const finalWidth = sizeMode === "image" ? Math.max(1, Math.min(100, Math.round(targetWidth))) : document.width;
  const matchedHeight = Math.round((finalWidth * cellAspectRatio(document)) / imageAspect);
  const finalHeight = sizeMode === "image" ? Math.max(1, Math.min(100, matchedHeight)) : document.height;
  const physicalAspect = (finalWidth * cellAspectRatio(document)) / finalHeight;

  return (
    <>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} />
      <button className="secondary-button" onClick={() => inputRef.current?.click()} disabled={loading}>
        {loading ? "Opening…" : "From image"}
      </button>
      {error && !previewUrl ? <span className="import-trigger-error" role="alert">{error}</span> : null}

      {previewUrl && image ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="import-dialog-heading">
              <div><p className="eyebrow">Create from image</p><h1 id="import-title">Import image</h1></div>
              <button className="close-dialog" aria-label="Close image importer" onClick={releaseImage}>×</button>
            </div>

            <div className="import-preview" style={{ aspectRatio: physicalAspect }}>
              <CropPreview image={image} aspect={physicalAspect} fit={fit} position={cropPosition} zoom={cropZoom} onPositionChange={setCropPosition} />
            </div>

            {fit === "cover" ? <p className="crop-hint">Drag the image to choose the crop.</p> : null}

            <div className="import-options">
              <label>Fit image
                <select value={fit} onChange={(event) => {
                  const nextFit = event.target.value as FitMode;
                  setFit(nextFit);
                  if (nextFit === "contain") setCropZoom(1);
                }}>
                  <option value="cover">Fill chart</option>
                  <option value="contain">Show whole image</option>
                </select>
              </label>
              <label>Colours
                <select value={paletteMode} onChange={(event) => setPaletteMode(event.target.value as PaletteMode)}>
                  <option value="image">Create from image</option>
                  <option value="existing">Use chart palette</option>
                </select>
              </label>
              {paletteMode === "image" ? (
                <label>Number of colours
                  <select value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))}>
                    {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </label>
              ) : null}
              <label>Chart size
                <select value={sizeMode} onChange={(event) => setSizeMode(event.target.value as SizeMode)}>
                  <option value="current">Keep {document.width} × {document.height}</option>
                  <option value="image">Match image proportions</option>
                </select>
              </label>
              {sizeMode === "image" ? (
                <label>Stitches wide
                  <input type="number" min="1" max="100" value={targetWidth} onChange={(event) => setTargetWidth(Number(event.target.value) || 1)} />
                </label>
              ) : null}
            </div>

            {fit === "cover" ? (
              <label className="image-zoom">Image zoom
                <input type="range" min="1" max="2.5" step="0.05" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} />
              </label>
            ) : null}

            <p className="import-note">
              Creates a {finalWidth} × {finalHeight} stitch chart. You can edit every stitch afterwards.
            </p>
            {error ? <p className="import-error" role="alert">{error}</p> : null}
            <div className="import-actions">
              <button onClick={releaseImage}>Cancel</button>
              <button className="primary-button" onClick={createChart}>Create chart</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
