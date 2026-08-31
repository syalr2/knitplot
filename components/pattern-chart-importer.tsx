"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { MAX_CHART_ROWS, MAX_CHART_STITCHES, type ChartDocument, type PaletteColor, type StitchAction } from "@/lib/chart";

type SymbolMeaning = "main" | "pattern" | "no-stitch" | "m1l" | "m1r" | "kfb" | "inc" | "ssk" | "k2tog" | "cdd" | "dec";
type CropRect = { x: number; y: number; width: number; height: number };
type SourceImage = { url: string; width: number; height: number; label: string };
type SymbolSample = { index: number; sampleUrl: string };
type SymbolGroup = { id: number; count: number; samples: SymbolSample[]; darkness: number };
type Analysis = { assignments: number[]; features: number[][]; groups: SymbolGroup[] };

type PdfPage = {
  getViewport(input: { scale: number }): { width: number; height: number };
  render(input: { canvasContext: CanvasRenderingContext2D; canvas: HTMLCanvasElement; viewport: unknown }): { promise: Promise<void> };
};

type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};

type Props = {
  open: boolean;
  document: ChartDocument;
  onClose: () => void;
  onOpenKnitMode: () => void;
  onImport: (
    palette: PaletteColor[],
    cells: string[][],
    stitchActions: StitchAction[][],
    construction: ChartDocument["instructions"]["construction"],
    name?: string,
  ) => void;
};

const DEFAULT_CROP: CropRect = { x: 5, y: 5, width: 90, height: 75 };
const FEATURE_SIDE = 12;
const FEATURE_PIXELS = FEATURE_SIDE * FEATURE_SIDE;
const MATCHING_SYMBOL_THRESHOLD = 0.006;
const SYMBOL_OPTIONS: Array<{ value: SymbolMeaning; label: string }> = [
  { value: "main", label: "Main colour · knit" },
  { value: "pattern", label: "Pattern colour · knit" },
  { value: "no-stitch", label: "No stitch · skip" },
  { value: "m1l", label: "Increase · M1L" },
  { value: "m1r", label: "Increase · M1R" },
  { value: "kfb", label: "Increase · kfb" },
  { value: "inc", label: "Increase · generic" },
  { value: "ssk", label: "Decrease · SSK" },
  { value: "k2tog", label: "Decrease · k2tog" },
  { value: "cdd", label: "Decrease · centred double" },
  { value: "dec", label: "Decrease · generic" },
];

function meaningAction(meaning: SymbolMeaning): StitchAction {
  return meaning === "main" || meaning === "pattern" ? "knit" : meaning;
}

function previewActionSymbol(action: StitchAction) {
  return action === "no-stitch" ? "—" : action === "m1l" ? "L" : action === "m1r" ? "R" : action === "kfb" ? "FB" : action === "inc" ? "+" : action === "ssk" ? "S" : action === "k2tog" ? "2" : action === "cdd" ? "C" : action === "dec" ? "−" : "";
}

async function destroyPdf(pdf: PdfDocument | null) {
  if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That page image could not be opened."));
    image.src = url;
  });
}

function featureDistance(first: number[], second: number[]) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index] - second[index];
    total += difference * difference;
  }
  return total;
}

function clusterFeatures(features: number[][], requestedCount: number) {
  const count = clamp(requestedCount, 2, Math.min(12, features.length));
  const centers: number[][] = [features.reduce((lightest, feature) => {
    const average = feature.reduce((total, value) => total + value, 0) / feature.length;
    const lightestAverage = lightest.reduce((total, value) => total + value, 0) / lightest.length;
    return average > lightestAverage ? feature : lightest;
  }, features[0])];

  while (centers.length < count) {
    let candidate = features[0];
    let greatestDistance = -1;
    for (const feature of features) {
      const nearestDistance = Math.min(...centers.map((center) => featureDistance(feature, center)));
      if (nearestDistance > greatestDistance) {
        greatestDistance = nearestDistance;
        candidate = feature;
      }
    }
    centers.push([...candidate]);
  }

  let assignments = new Array(features.length).fill(0);
  for (let iteration = 0; iteration < 14; iteration += 1) {
    assignments = features.map((feature) => {
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, index) => {
        const distance = featureDistance(feature, center);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      return nearest;
    });

    centers.forEach((center, centerIndex) => {
      const members = features.filter((_, index) => assignments[index] === centerIndex);
      if (!members.length) return;
      for (let featureIndex = 0; featureIndex < center.length; featureIndex += 1) {
        center[featureIndex] = members.reduce((total, feature) => total + feature[featureIndex], 0) / members.length;
      }
    });
  }

  return { centers, assignments };
}

function featureImage(feature: number[]) {
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

function symbolDistance(first: number[], second: number[]) {
  let total = 0;
  for (let index = 0; index < FEATURE_PIXELS; index += 1) {
    const difference = first[index] - second[index];
    total += difference * difference;
  }
  return total / FEATURE_PIXELS;
}

function looksLikeDownTriangle(feature: number[]) {
  const ink = feature.slice(0, FEATURE_PIXELS).map((value) => 1 - value);
  function region(rowStart: number, rowEnd: number, columnStart: number, columnEnd: number) {
    let total = 0;
    let count = 0;
    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let column = columnStart; column < columnEnd; column += 1) {
        total += ink[row * FEATURE_SIDE + column];
        count += 1;
      }
    }
    return count ? total / count : 0;
  }
  const totalInk = ink.reduce((total, value) => total + value, 0) / ink.length;
  const upper = region(1, 6, 1, 11);
  const lower = region(6, 11, 1, 11);
  const upperCenter = region(1, 6, 3, 9);
  const upperEdges = (region(1, 6, 0, 3) + region(1, 6, 9, 12)) / 2;
  const lowerCenter = region(6, 11, 4, 8);
  const lowerEdges = (region(6, 11, 0, 4) + region(6, 11, 8, 12)) / 2;
  return totalInk > 0.08
    && totalInk < 0.58
    && upper > lower * 1.25
    && upperCenter > upperEdges * 1.12
    && lowerCenter > lowerEdges * 1.45;
}

function representativeSamples(features: number[][], assignments: number[], center: number[], groupId: number) {
  const members = features
    .map((feature, index) => ({
      feature,
      index,
      centerDistance: featureDistance(feature, center),
      darkness: 1 - feature.slice(0, FEATURE_PIXELS).reduce((total, value) => total + value, 0) / FEATURE_PIXELS,
    }))
    .filter((member) => assignments[member.index] === groupId);
  if (!members.length) return [];

  const chosen = [
    [...members].sort((first, second) => first.centerDistance - second.centerDistance)[0],
    [...members].sort((first, second) => second.centerDistance - first.centerDistance)[0],
    [...members].sort((first, second) => second.darkness - first.darkness)[0],
  ];
  return chosen
    .filter((member, index) => chosen.findIndex((candidate) => candidate.index === member.index) === index)
    .map((member) => ({ index: member.index, sampleUrl: featureImage(member.feature) }));
}

async function chartFeatures(source: SourceImage, crop: CropRect, columns: number, rows: number) {
  const image = await loadImage(source.url);
  const cellSize = 28;
  const canvas = window.document.createElement("canvas");
  canvas.width = columns * cellSize;
  canvas.height = rows * cellSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The chart could not be analysed.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    image.naturalWidth * crop.x / 100,
    image.naturalHeight * crop.y / 100,
    image.naturalWidth * crop.width / 100,
    image.naturalHeight * crop.height / 100,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const features: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const pixels = context.getImageData(column * cellSize, row * cellSize, cellSize, cellSize).data;
      const grayscale: number[] = [];
      for (let sampleRow = 0; sampleRow < FEATURE_SIDE; sampleRow += 1) {
        for (let sampleColumn = 0; sampleColumn < FEATURE_SIDE; sampleColumn += 1) {
          const sourceX = Math.round(3 + sampleColumn * (cellSize - 7) / (FEATURE_SIDE - 1));
          const sourceY = Math.round(3 + sampleRow * (cellSize - 7) / (FEATURE_SIDE - 1));
          let total = 0;
          let samples = 0;
          for (let y = sourceY; y < Math.min(cellSize - 2, sourceY + 2); y += 1) {
            for (let x = sourceX; x < Math.min(cellSize - 2, sourceX + 2); x += 1) {
              const offset = (y * cellSize + x) * 4;
              total += (pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114) / 255;
              samples += 1;
            }
          }
          grayscale.push(samples ? total / samples : 1);
        }
      }
      const ink: number[] = grayscale.map((value) => value < 0.76 ? 1 : 0);
      const rowShape = Array.from({ length: FEATURE_SIDE }, (_, sampleRow) => (
        ink.slice(sampleRow * FEATURE_SIDE, (sampleRow + 1) * FEATURE_SIDE).reduce((total, value) => total + value, 0) / FEATURE_SIDE
      ));
      const columnShape = Array.from({ length: FEATURE_SIDE }, (_, sampleColumn) => (
        ink.reduce((total, value, index) => index % FEATURE_SIDE === sampleColumn ? total + value : total, 0) / FEATURE_SIDE
      ));
      const feature = [...grayscale, ...ink, ...ink, ...rowShape, ...rowShape, ...columnShape, ...columnShape];
      features.push(feature);
    }
  }
  return features;
}

async function detectGrid(source: SourceImage, crop: CropRect) {
  const image = await loadImage(source.url);
  const maximum = 1400;
  const sourceWidth = image.naturalWidth * crop.width / 100;
  const sourceHeight = image.naturalHeight * crop.height / 100;
  const scale = Math.min(8, maximum / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(50, Math.round(sourceWidth * scale));
  const height = Math.max(50, Math.round(sourceHeight * scale));
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The grid could not be detected.");
  context.drawImage(
    image,
    image.naturalWidth * crop.x / 100,
    image.naturalHeight * crop.y / 100,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
  const pixels = context.getImageData(0, 0, width, height).data;

  function lineClusterCount(axis: "x" | "y") {
    const length = axis === "x" ? width : height;
    const crossLength = axis === "x" ? height : width;
    const lineScores: number[] = [];
    for (let position = 0; position < length; position += 1) {
      let dark = 0;
      for (let cross = 0; cross < crossLength; cross += 1) {
        const x = axis === "x" ? position : cross;
        const y = axis === "x" ? cross : position;
        const offset = (y * width + x) * 4;
        const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
        if (luminance < 220) dark += 1;
      }
      lineScores.push(dark / crossLength);
    }
    let best = { score: 0, period: 0, mean: 0, strong: 0 };
    const maximumPeriod = Math.min(100, length / 2);
    for (let period = 6; period <= maximumPeriod; period += 0.25) {
      for (let start = 0; start < period; start += 0.5) {
        const samples: number[] = [];
        for (let position = start; position < length; position += period) {
          samples.push(lineScores[Math.round(position)] ?? 0);
        }
        if (samples.length < 3) continue;
        const mean = samples.reduce((total, value) => total + value, 0) / samples.length;
        const strong = samples.filter((value) => value > 0.68).length / samples.length;
        const score = mean * (0.35 + 0.65 * strong) * Math.sqrt(samples.length);
        if (score > best.score) best = { score, period, mean, strong };
      }
    }
    if (!best.period || best.mean < 0.38 || best.strong < 0.45) return 0;
    return Math.round(length / best.period);
  }

  return { columns: lineClusterCount("x"), rows: lineClusterCount("y") };
}

function importedCells(
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
      cellRow.push(meaning === "pattern" ? palette[1].id : palette[0].id);
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

export function PatternChartImporter({ open, document, onClose, onOpenKnitMode, onImport }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; x: number; y: number; crop: CropRect } | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [fileName, setFileName] = useState("Imported pattern chart");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageZoom, setPageZoom] = useState(100);
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [columns, setColumns] = useState(document.width);
  const [rows, setRows] = useState(document.height);
  const [groupCount, setGroupCount] = useState(8);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [meanings, setMeanings] = useState<Record<number, SymbolMeaning>>({});
  const [overrides, setOverrides] = useState<Record<number, SymbolMeaning>>({});
  const [correctionMeaning, setCorrectionMeaning] = useState<SymbolMeaning>("m1l");
  const [correctionScope, setCorrectionScope] = useState<"matching" | "single">("matching");
  const [previewMode, setPreviewMode] = useState<"source" | "interpreted">("source");
  const [gridSuggestion, setGridSuggestion] = useState<string | null>(null);
  const [construction, setConstruction] = useState<ChartDocument["instructions"]["construction"]>("round");
  const [firstRow, setFirstRow] = useState<"bottom" | "top">("bottom");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const palette = useMemo<PaletteColor[]>(() => [
    { id: "background", hex: document.palette[0]?.hex ?? "#f2eadf" },
    { id: "ink", hex: document.palette[1]?.hex ?? "#334c44" },
  ], [document.palette]);
  const result = analysis ? importedCells(analysis, meanings, overrides, columns, rows, firstRow, palette) : null;
  const displayResult = analysis ? importedCells(analysis, meanings, overrides, columns, rows, "bottom", palette) : null;

  useEffect(() => () => { void destroyPdf(pdfRef.current); }, []);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setAnalysis(null);
    setMeanings({});
    setOverrides({});
    setPreviewMode("source");
    setGridSuggestion(null);
    setMessage("");
  }, [open]);

  async function renderPdfPage(nextPage: number, pdf = pdfRef.current) {
    if (!pdf) return;
    setBusy(true);
    setMessage("Rendering this page locally…");
    try {
      const pageObject = await pdf.getPage(nextPage);
      const initialViewport = pageObject.getViewport({ scale: 1 });
      const scale = Math.min(2.4, 1800 / Math.max(initialViewport.width, initialViewport.height));
      const viewport = pageObject.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("That PDF page could not be rendered.");
      await pageObject.render({ canvasContext: context, canvas, viewport }).promise;
      setSource({ url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, label: `Page ${nextPage}` });
      setPage(nextPage);
      setPageZoom(100);
      setCrop(DEFAULT_CROP);
      setGridSuggestion(null);
      setMessage("PDF stays on this device. Choose the chart area below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That PDF page could not be rendered.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File) {
    setMessage("");
    setAnalysis(null);
    setGridSuggestion(null);
    if (file.size > 25_000_000) {
      setMessage("Please choose a pattern file smaller than 25 MB.");
      return;
    }
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    setFileName(baseName || "Imported pattern chart");
    setBusy(true);
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        await destroyPdf(pdfRef.current);
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise as unknown as PdfDocument;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        const suggestedPage = pdf.numPages;
        await renderPdfPage(suggestedPage, pdf);
      } else if (["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        await destroyPdf(pdfRef.current);
        pdfRef.current = null;
        setPageCount(1);
        setPage(1);
        const url = URL.createObjectURL(file);
        const image = await loadImage(url);
        const canvas = window.document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("That image could not be opened.");
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        setSource({ url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, label: file.name });
        setPageZoom(100);
        setCrop(DEFAULT_CROP);
        setMessage("The image stays on this device. Choose the chart area below.");
      } else {
        throw new Error("Choose a PDF, PNG, JPEG, or WebP pattern file.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That pattern file could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function rotateSource() {
    if (!source) return;
    const image = await loadImage(source.url);
    const canvas = window.document.createElement("canvas");
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0);
    setSource({ ...source, url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
    setPageZoom(100);
    setCrop(DEFAULT_CROP);
    setGridSuggestion(null);
  }

  function beginCropDrag(event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, x: event.clientX, y: event.clientY, crop };
  }

  function dragCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = (event.clientX - drag.x) / bounds.width * 100;
    const dy = (event.clientY - drag.y) / bounds.height * 100;
    if (drag.mode === "move") {
      setCrop({ ...drag.crop, x: clamp(drag.crop.x + dx, 0, 100 - drag.crop.width), y: clamp(drag.crop.y + dy, 0, 100 - drag.crop.height) });
    } else {
      setCrop({ ...drag.crop, width: clamp(drag.crop.width + dx, 5, 100 - drag.crop.x), height: clamp(drag.crop.height + dy, 5, 100 - drag.crop.y) });
    }
  }

  async function autoDetectGrid() {
    if (!source) return;
    setBusy(true);
    setMessage("Looking for continuous grid lines…");
    try {
      const detected = await detectGrid(source, crop);
      if (detected.columns < 2 || detected.columns > MAX_CHART_STITCHES || detected.rows < 2 || detected.rows > MAX_CHART_ROWS) {
        setMessage("KnitPlot could not confidently count this grid. Enter its stitch and row count manually.");
      } else {
        setColumns(detected.columns);
        setRows(detected.rows);
        setMessage(`Suggested ${detected.columns} stitches × ${detected.rows} rows. Automatic counting is only a starting point—check every overlay cell and correct the numbers if needed.`);
      }
    } catch {
      setMessage("KnitPlot could not confidently count this grid. Enter its stitch and row count manually.");
    } finally {
      setBusy(false);
    }
  }

  async function analyseSymbols(nextGroupCount = groupCount) {
    if (!source) return;
    setBusy(true);
    setMessage("Checking the grid and grouping matching chart symbols locally…");
    try {
      const detected = await detectGrid(source, crop);
      const suggestionKey = `${detected.columns}x${detected.rows}`;
      const detectedLooksValid = detected.columns >= 2 && detected.columns <= MAX_CHART_STITCHES && detected.rows >= 2 && detected.rows <= MAX_CHART_ROWS;
      if (detectedLooksValid && (detected.columns !== columns || detected.rows !== rows) && gridSuggestion !== suggestionKey) {
        setColumns(detected.columns);
        setRows(detected.rows);
        setGridSuggestion(suggestionKey);
        setMessage(`The printed grid looks like ${detected.columns} stitches × ${detected.rows} rows, rather than ${columns} × ${rows}. KnitPlot updated the overlay so symbols do not drift between cells. Check it, then choose Find repeated symbols again. If the printed pattern states different numbers, enter them again and continue.`);
        return;
      }
      const features = await chartFeatures(source, crop, columns, rows);
      const clustered = clusterFeatures(features, nextGroupCount);
      const groups = clustered.centers.map((center, id) => ({
        id,
        count: clustered.assignments.filter((assignment) => assignment === id).length,
        samples: representativeSamples(features, clustered.assignments, center, id),
        darkness: 1 - center.slice(0, FEATURE_PIXELS).reduce((total, value) => total + value, 0) / FEATURE_PIXELS,
      })).sort((first, second) => first.darkness - second.darkness);
      const defaults: Record<number, SymbolMeaning> = {};
      groups.forEach((group, index) => {
        defaults[group.id] = index === 0
          ? "main"
          : index === groups.length - 1 && group.darkness > 0.52
            ? "no-stitch"
            : looksLikeDownTriangle(clustered.centers[group.id])
              ? "m1l"
              : "pattern";
      });
      setAnalysis({ assignments: clustered.assignments, features, groups });
      setMeanings(defaults);
      setOverrides({});
      setPreviewMode("interpreted");
      setGroupCount(nextGroupCount);
      setStep(3);
      setMessage("Confirm what each repeated symbol means. You can regroup if two symbols were combined.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The chart symbols could not be grouped.");
    } finally {
      setBusy(false);
    }
  }

  function correctCell(cellIndex: number) {
    if (!analysis) return;
    const affected = correctionScope === "single"
      ? [cellIndex]
      : analysis.features
        .map((feature, index) => ({ index, distance: symbolDistance(analysis.features[cellIndex], feature) }))
        .filter((candidate) => candidate.distance <= MATCHING_SYMBOL_THRESHOLD)
        .map((candidate) => candidate.index);
    setOverrides((current) => {
      const next = { ...current };
      affected.forEach((index) => { next[index] = correctionMeaning; });
      return next;
    });
    const label = SYMBOL_OPTIONS.find((option) => option.value === correctionMeaning)?.label ?? correctionMeaning;
    setMessage(correctionScope === "single"
      ? `Corrected this cell to ${label}.`
      : `Corrected ${affected.length} closely matching ${affected.length === 1 ? "cell" : "cells"} to ${label}. Check the preview and click any remaining symbols.`);
  }

  function finishImport(openKnitMode = false) {
    if (!result) return;
    onImport(palette, result.cells, result.stitchActions, construction, fileName);
    onClose();
    if (openKnitMode) window.setTimeout(onOpenKnitMode, 0);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop pattern-import-backdrop" role="presentation">
      <section className="import-dialog pattern-import-dialog" role="dialog" aria-modal="true" aria-labelledby="pattern-import-title">
        <div className="import-dialog-heading">
          <div><p className="eyebrow">Import an existing pattern</p><h1 id="pattern-import-title">Bring a chart into KnitPlot</h1></div>
          <button className="close-dialog" aria-label="Close pattern chart import" onClick={onClose}>×</button>
        </div>

        <div className="pattern-import-steps" aria-label="Import progress">
          <span className={step >= 1 ? "active" : ""}>1 · Pattern page</span>
          <span className={step >= 2 ? "active" : ""}>2 · Crop and grid</span>
          <span className={step >= 3 ? "active" : ""}>3 · Symbols</span>
        </div>

        {step === 1 ? (
          <div className="pattern-import-stage">
            <div className="pattern-file-prompt">
              <input ref={fileInputRef} className="visually-hidden" type="file" accept=".pdf,image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void chooseFile(file); }} />
              <button className="primary-button" onClick={() => fileInputRef.current?.click()} disabled={busy}>{source ? "Choose a different file" : "Choose PDF or image"}</button>
              <p>PDF pages are rendered and analysed in your browser. The source pattern is never uploaded or saved by KnitPlot.</p>
            </div>
            {source ? <>
              {pageCount > 1 ? <div className="pattern-page-controls">
                <button onClick={() => void renderPdfPage(page - 1)} disabled={busy || page <= 1}>Previous page</button>
                <label>Page <input type="number" min="1" max={pageCount} value={page} onChange={(event) => { const next = clamp(Number(event.target.value), 1, pageCount); void renderPdfPage(next); }} /> of {pageCount}</label>
                <button onClick={() => void renderPdfPage(page + 1)} disabled={busy || page >= pageCount}>Next page</button>
                <span>Last page suggested</span>
              </div> : null}
              <div className="pattern-page-preview"><img src={source.url} alt={source.label} /></div>
              <div className="import-actions"><button onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => setStep(2)}>Use this page</button></div>
            </> : null}
          </div>
        ) : null}

        {step === 2 && source ? (
          <div className="pattern-import-stage pattern-grid-stage">
            <div className="pattern-crop-workspace">
              <div className="pattern-crop-toolbar">
                <label>
                  Page zoom
                  <button
                    type="button"
                    aria-label="Zoom page out"
                    onClick={() => setPageZoom((current) => clamp(current - 25, 50, 300))}
                    disabled={pageZoom <= 50}
                  >−</button>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="10"
                    value={pageZoom}
                    onChange={(event) => setPageZoom(Number(event.target.value))}
                  />
                  <button
                    type="button"
                    aria-label="Zoom page in"
                    onClick={() => setPageZoom((current) => clamp(current + 25, 50, 300))}
                    disabled={pageZoom >= 300}
                  >+</button>
                  <span>{pageZoom}%</span>
                </label>
                <button onClick={() => setPageZoom(100)}>Reset zoom</button>
              </div>
              <div
                className="pattern-crop-viewport"
              >
                <div
                  ref={previewRef}
                  className="pattern-crop-preview"
                  style={{ width: `${pageZoom}%`, aspectRatio: `${source.width} / ${source.height}` }}
                  onPointerMove={dragCrop}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                >
                  <img src={source.url} alt="Selected pattern page" draggable={false} />
                  <div className="pattern-crop-shade" />
                  <div
                    className="pattern-crop-box"
                    style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%`, gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
                    onPointerDown={(event) => beginCropDrag(event, "move")}
                  >
                    <span className="pattern-grid-overlay" style={{ backgroundSize: `${100 / columns}% ${100 / rows}%` }} />
                    <span className="pattern-crop-handle" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, "resize"); }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="pattern-crop-closeup" style={{ aspectRatio: `${source.width * crop.width} / ${source.height * crop.height}` }}>
              <div
                className="pattern-crop-closeup-image"
                style={{
                  backgroundImage: `url(${source.url})`,
                  backgroundSize: `${10000 / crop.width}% ${10000 / crop.height}%`,
                  backgroundPosition: `${crop.width >= 100 ? 0 : crop.x / (100 - crop.width) * 100}% ${crop.height >= 100 ? 0 : crop.y / (100 - crop.height) * 100}%`,
                }}
              />
              <span className="pattern-grid-overlay" style={{ backgroundSize: `${100 / columns}% ${100 / rows}%` }} />
            </div>
            <aside className="pattern-grid-controls">
              <label>Chart name<input value={fileName} maxLength={200} onChange={(event) => setFileName(event.target.value)} /></label>
              <div className="two-fields">
                <label>Stitches<input type="number" min="2" max={MAX_CHART_STITCHES} value={columns} onChange={(event) => setColumns(clamp(Number(event.target.value), 2, MAX_CHART_STITCHES))} /></label>
                <label>Rows<input type="number" min="2" max={MAX_CHART_ROWS} value={rows} onChange={(event) => setRows(clamp(Number(event.target.value), 2, MAX_CHART_ROWS))} /></label>
              </div>
              <button onClick={() => void autoDetectGrid()} disabled={busy}>Try automatic grid count</button>
              <button onClick={() => void rotateSource()} disabled={busy}>Rotate page 90°</button>
              <button onClick={() => setCrop({ x: 0, y: 0, width: 100, height: 100 })}>Use whole page</button>
              <div className="pattern-crop-sliders">
                <label>Left edge<input type="range" min="0" max={100 - crop.width} step="0.1" value={crop.x} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) }))} /></label>
                <label>Top edge<input type="range" min="0" max={100 - crop.height} step="0.1" value={crop.y} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) }))} /></label>
                <label>Width<input type="range" min="5" max={100 - crop.x} step="0.1" value={crop.width} onChange={(event) => setCrop((current) => ({ ...current, width: Number(event.target.value) }))} /></label>
                <label>Height<input type="range" min="5" max={100 - crop.y} step="0.1" value={crop.height} onChange={(event) => setCrop((current) => ({ ...current, height: Number(event.target.value) }))} /></label>
              </div>
              <label>Worked<select value={construction} onChange={(event) => setConstruction(event.target.value as ChartDocument["instructions"]["construction"])}><option value="round">In the round</option><option value="flat">Flat</option></select></label>
              <label>First row appears<select value={firstRow} onChange={(event) => setFirstRow(event.target.value as "bottom" | "top")}><option value="bottom">At the bottom</option><option value="top">At the top</option></select></label>
              <p>Drag the green box over only the chart. Drag its corner to resize it, then make sure every overlay cell matches one printed chart cell.</p>
            </aside>
            <div className="import-actions pattern-wide-actions"><button onClick={() => setStep(1)}>Back</button><button className="primary-button" onClick={() => void analyseSymbols()} disabled={busy}>Find repeated symbols</button></div>
          </div>
        ) : null}

        {step === 3 && analysis && result && displayResult && source ? (
          <div className="pattern-import-stage pattern-symbol-stage">
            <div className="pattern-symbol-controls">
              <div className="pattern-group-count"><label>Symbol groups <select value={groupCount} onChange={(event) => void analyseSymbols(Number(event.target.value))}>{[4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => <option key={count}>{count}</option>)}</select></label><span>Each row shows real chart cells. Use more groups if different symbols appear together.</span></div>
              <div className="pattern-symbol-list">
                {analysis.groups.map((group, displayIndex) => (
                  <label className="pattern-symbol-row" key={group.id}>
                    <span className="pattern-symbol-samples">
                      {group.samples.map((sample, sampleIndex) => (
                        <img key={sample.index} src={sample.sampleUrl} alt={`Real cell example ${sampleIndex + 1} from group ${displayIndex + 1}`} />
                      ))}
                    </span>
                    <span><strong>Group {displayIndex + 1}</strong><small>{group.count} chart cells</small></span>
                    <select value={meanings[group.id] ?? "main"} onChange={(event) => setMeanings((current) => ({ ...current, [group.id]: event.target.value as SymbolMeaning }))}>
                      {SYMBOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="pattern-result-preview">
              <div className="pattern-result-heading">
                <div><h2>Live chart preview</h2><p>Updates as you change the symbol choices.</p></div>
                <div className="pattern-result-toggle" aria-label="Chart review view">
                  <button className={previewMode === "source" ? "active" : ""} onClick={() => setPreviewMode("source")}>Original symbols</button>
                  <button className={previewMode === "interpreted" ? "active" : ""} onClick={() => setPreviewMode("interpreted")}>Live KnitPlot preview</button>
                </div>
              </div>
              <div className="pattern-correction-controls">
                <strong>Fix a symbol</strong>
                <label>Set to <select value={correctionMeaning} onChange={(event) => setCorrectionMeaning(event.target.value as SymbolMeaning)}>{SYMBOL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label>When clicked <select value={correctionScope} onChange={(event) => setCorrectionScope(event.target.value as "matching" | "single")}><option value="matching">Fix every matching symbol</option><option value="single">Fix only this cell</option></select></label>
                {Object.keys(overrides).length ? <button onClick={() => { setOverrides({}); setMessage("Manual symbol corrections cleared."); }}>Clear corrections</button> : null}
                <p>Choose the right meaning, then click a misidentified cell in the chart. Start with “every matching symbol” for repeated triangles or other printed symbols.</p>
              </div>
              <div className="pattern-result-scroll">
                <div
                  className={`pattern-result-grid ${previewMode === "source" ? "show-source" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(6px, 1fr))`,
                    aspectRatio: `${columns} / ${rows}`,
                    backgroundImage: previewMode === "source" ? `url(${source.url})` : undefined,
                    backgroundSize: previewMode === "source" ? `${10000 / crop.width}% ${10000 / crop.height}%` : undefined,
                    backgroundPosition: previewMode === "source" ? `${crop.width >= 100 ? 0 : crop.x / (100 - crop.width) * 100}% ${crop.height >= 100 ? 0 : crop.y / (100 - crop.height) * 100}%` : undefined,
                  }}
                >
                  {displayResult.cells.flatMap((cellRow, rowIndex) => cellRow.map((colorId, columnIndex) => {
                    const action = displayResult.stitchActions[rowIndex][columnIndex];
                    const cellIndex = rowIndex * columns + columnIndex;
                    return <button type="button" key={`${rowIndex}-${columnIndex}`} className={`${action === "no-stitch" ? "no-stitch" : ""} ${overrides[cellIndex] ? "corrected" : ""}`} style={{ background: previewMode === "source" ? "transparent" : action === "no-stitch" ? "#303632" : action !== "knit" ? "#ffffff" : palette.find((color) => color.id === colorId)?.hex }} title={`${action === "knit" ? "Knit" : action.toUpperCase()} · click to correct`} onClick={() => correctCell(cellIndex)}>{previewMode === "interpreted" ? previewActionSymbol(action) : ""}</button>;
                  }))}
                </div>
              </div>
              <p>Use Original symbols to click printed triangles or other rare marks. Switch to KnitPlot interpretation to verify the result before importing.</p>
            </div>
            <div className="import-actions pattern-wide-actions"><button onClick={() => setStep(2)}>Back to crop</button><button onClick={() => finishImport(false)}>Open in editor</button><button className="primary-button" onClick={() => finishImport(true)}>Import and start Knit Mode</button></div>
          </div>
        ) : null}

        {message ? <p className="pattern-import-message" role="status">{busy ? <span className="pattern-spinner" aria-hidden="true" /> : null}{message}</p> : null}
      </section>
    </div>
  );
}
