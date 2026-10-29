"use client";
/* eslint-disable @next/next/no-img-element -- Local PDF and crop previews use private data/blob URLs, not server-optimised assets. */

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  type ChartDocument,
  type PaletteColor,
  type StitchAction,
} from "@/lib/chart";
import {
  SymbolMeaning,
  CropRect,
  SourceImage,
  SymbolGroup,
  Analysis,
  SymbolDefinition,
  PdfDocument,
  DEFAULT_CROP,
  MATCHING_SYMBOL_THRESHOLD,
  SYMBOL_OPTIONS,
  DEFAULT_CATEGORY_MEANINGS,
  previewActionSymbol,
  destroyPdf,
  clamp,
  loadImage,
  featureImage,
  symbolDistance,
  symbolInk,
  chartFeatures,
  colorDistance,
  colorSwatch,
  classifyBaseColors,
  snapKnownGrid,
  importedCells,
} from "@/lib/pattern-chart-analysis";

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

export function PatternChartImporter({
  open,
  document,
  onClose,
  onOpenKnitMode,
  onImport,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    x: number;
    y: number;
    crop: CropRect;
  } | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [fileName, setFileName] = useState("Imported pattern chart");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageZoom, setPageZoom] = useState(100);
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [columns, setColumns] = useState(document.width);
  const [rows, setRows] = useState(document.height);
  const [columnsDraft, setColumnsDraft] = useState(String(document.width));
  const [rowsDraft, setRowsDraft] = useState(String(document.height));
  const [specialSymbolCount, setSpecialSymbolCount] = useState(3);
  const [symbolDefinitions, setSymbolDefinitions] = useState<
    SymbolDefinition[]
  >(() =>
    DEFAULT_CATEGORY_MEANINGS.slice(0, 3).map((meaning, id) => ({
      id,
      meaning,
      sampleIndices: [],
    })),
  );
  const [activeDefinitionId, setActiveDefinitionId] = useState<number | null>(
    null,
  );
  const [templatesApplied, setTemplatesApplied] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [meanings, setMeanings] = useState<Record<number, SymbolMeaning>>({});
  const [overrides, setOverrides] = useState<Record<number, SymbolMeaning>>({});
  const [correctionMeaning, setCorrectionMeaning] =
    useState<SymbolMeaning>("m1l");
  const [correctionScope, setCorrectionScope] = useState<"matching" | "single">(
    "matching",
  );
  const [previewMode, setPreviewMode] = useState<"source" | "interpreted">(
    "source",
  );
  const [cropBeforeSnap, setCropBeforeSnap] = useState<CropRect | null>(null);
  const [construction, setConstruction] =
    useState<ChartDocument["instructions"]["construction"]>("round");
  const [firstRow, setFirstRow] = useState<"bottom" | "top">("bottom");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cropPreviewUrl, setCropPreviewUrl] = useState("");

  const palette = useMemo<PaletteColor[]>(
    () => [
      { id: "background", hex: document.palette[0]?.hex ?? "#f2eadf" },
      { id: "ink", hex: document.palette[1]?.hex ?? "#334c44" },
    ],
    [document.palette],
  );
  const result = analysis
    ? importedCells(
        analysis,
        meanings,
        overrides,
        columns,
        rows,
        firstRow,
        palette,
      )
    : null;
  const displayResult = analysis
    ? importedCells(
        analysis,
        meanings,
        overrides,
        columns,
        rows,
        "bottom",
        palette,
      )
    : null;
  const draftColumns = Number(columnsDraft);
  const draftRows = Number(rowsDraft);
  const gridDimensionsValid =
    Number.isInteger(draftColumns) &&
    draftColumns >= 2 &&
    draftColumns <= MAX_CHART_STITCHES &&
    Number.isInteger(draftRows) &&
    draftRows >= 2 &&
    draftRows <= MAX_CHART_ROWS;

  useEffect(
    () => () => {
      void destroyPdf(pdfRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Do not display a stale crop while its replacement image is being rendered.
    setCropPreviewUrl("");
    const timer = window.setTimeout(() => {
      if (!source) {
        setCropPreviewUrl("");
        return;
      }
      void loadImage(source.url).then((image) => {
        if (cancelled) return;
        const sourceWidth = Math.max(
          1,
          (image.naturalWidth * crop.width) / 100,
        );
        const sourceHeight = Math.max(
          1,
          (image.naturalHeight * crop.height) / 100,
        );
        const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return;
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
        if (!cancelled) setCropPreviewUrl(canvas.toDataURL("image/png"));
      });
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [crop, source]);

  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Closing the import dialog discards its transient analysis; it does not modify the chart.
    setStep(1);
    setAnalysis(null);
    setMeanings({});
    setOverrides({});
    setPreviewMode("source");
    setCropBeforeSnap(null);
    setActiveDefinitionId(null);
    setTemplatesApplied(false);
    setMessage("");
  }, [open]);

  async function renderPdfPage(nextPage: number, pdf = pdfRef.current) {
    if (!pdf) return;
    setBusy(true);
    setMessage("Rendering this page locally…");
    try {
      const pageObject = await pdf.getPage(nextPage);
      const initialViewport = pageObject.getViewport({ scale: 1 });
      const scale = Math.min(
        2.4,
        1800 / Math.max(initialViewport.width, initialViewport.height),
      );
      const viewport = pageObject.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("That PDF page could not be rendered.");
      await pageObject.render({ canvasContext: context, canvas, viewport })
        .promise;
      setSource({
        url: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
        label: `Page ${nextPage}`,
      });
      setPage(nextPage);
      setPageZoom(100);
      setCrop(DEFAULT_CROP);
      setCropBeforeSnap(null);
      setMessage("PDF stays on this device. Choose the chart area below.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That PDF page could not be rendered.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function chooseFile(file: File) {
    setMessage("");
    setAnalysis(null);
    setCropBeforeSnap(null);
    if (file.size > 25_000_000) {
      setMessage("Please choose a pattern file smaller than 25 MB.");
      return;
    }
    const baseName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim();
    setFileName(baseName || "Imported pattern chart");
    setBusy(true);
    try {
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        await destroyPdf(pdfRef.current);
        const pdf = (await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise) as unknown as PdfDocument;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        const suggestedPage = pdf.numPages;
        await renderPdfPage(suggestedPage, pdf);
      } else if (
        ["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ) {
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
        setSource({
          url: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height,
          label: file.name,
        });
        setPageZoom(100);
        setCrop(DEFAULT_CROP);
        setCropBeforeSnap(null);
        setMessage(
          "The image stays on this device. Choose the chart area below.",
        );
      } else {
        throw new Error("Choose a PDF, PNG, JPEG, or WebP pattern file.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That pattern file could not be opened.",
      );
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
    setSource({
      ...source,
      url: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });
    setPageZoom(100);
    setCrop(DEFAULT_CROP);
    setCropBeforeSnap(null);
  }

  function beginCropDrag(
    event: ReactPointerEvent<HTMLElement>,
    mode: "move" | "resize",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, x: event.clientX, y: event.clientY, crop };
  }

  function dragCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!drag || !bounds) return;
    const dx = ((event.clientX - drag.x) / bounds.width) * 100;
    const dy = ((event.clientY - drag.y) / bounds.height) * 100;
    if (drag.mode === "move") {
      setCrop({
        ...drag.crop,
        x: clamp(drag.crop.x + dx, 0, 100 - drag.crop.width),
        y: clamp(drag.crop.y + dy, 0, 100 - drag.crop.height),
      });
    } else {
      setCrop({
        ...drag.crop,
        width: clamp(drag.crop.width + dx, 5, 100 - drag.crop.x),
        height: clamp(drag.crop.height + dy, 5, 100 - drag.crop.y),
      });
    }
  }

  function updateGridDimension(axis: "columns" | "rows", value: string) {
    const parsed = Number(value);
    const maximum = axis === "columns" ? MAX_CHART_STITCHES : MAX_CHART_ROWS;
    if (axis === "columns") setColumnsDraft(value);
    else setRowsDraft(value);
    if (!Number.isInteger(parsed) || parsed < 2 || parsed > maximum) return;
    if (axis === "columns") setColumns(parsed);
    else setRows(parsed);
  }

  function finishGridDimension(axis: "columns" | "rows") {
    const draft = axis === "columns" ? columnsDraft : rowsDraft;
    const parsed = Number(draft);
    const maximum = axis === "columns" ? MAX_CHART_STITCHES : MAX_CHART_ROWS;
    if (Number.isInteger(parsed) && parsed >= 2 && parsed <= maximum) return;
    if (axis === "columns") setColumnsDraft(String(columns));
    else setRowsDraft(String(rows));
  }

  async function snapGridToChart() {
    if (!source) return;
    setBusy(true);
    setMessage(
      `Aligning ${columns} stitches × ${rows} rows to the printed grid…`,
    );
    try {
      const previous = crop;
      const fitted = await snapKnownGrid(source, crop, columns, rows);
      setCropBeforeSnap(previous);
      setCrop(fitted.crop);
      setPageZoom((current) => Math.max(current, 125));
      setMessage(
        fitted.confidence >= 0.16
          ? `Grid snapped to ${columns} stitches × ${rows} rows. Check the close-up overlay, then make any small edge adjustments you need.`
          : `KnitPlot applied its best ${columns} × ${rows} alignment, but the printed lines are faint or interrupted. Check the close-up carefully and use the edge controls if needed.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The grid could not be aligned. Keep the rough crop and use the edge controls instead.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeSpecialSymbolCount(count: number) {
    setSpecialSymbolCount(count);
    setSymbolDefinitions((current) =>
      Array.from(
        { length: count },
        (_, id) =>
          current[id] ?? {
            id,
            meaning:
              DEFAULT_CATEGORY_MEANINGS[id % DEFAULT_CATEGORY_MEANINGS.length],
            sampleIndices: [],
          },
      ),
    );
    setActiveDefinitionId(null);
    setTemplatesApplied(false);
  }

  async function analyseSymbols() {
    if (!source) return;
    setBusy(true);
    setMessage(
      "Separating the chart colours and preparing cells for category examples…",
    );
    try {
      const extracted = await chartFeatures(source, crop, columns, rows);
      const colors = classifyBaseColors(extracted.baseColors);
      const groups: SymbolGroup[] = [0, 1].map((id) => ({
        id,
        count: colors.assignments.filter((assignment) => assignment === id)
          .length,
        samples: [],
        darkness:
          1 - colors.centers[id].reduce((total, value) => total + value, 0) / 3,
      }));
      setAnalysis({
        assignments: [...colors.assignments],
        colorAssignments: colors.assignments,
        baseColors: extracted.baseColors,
        features: extracted.features,
        groups,
        sourcePreviewUrl: extracted.sourcePreviewUrl,
      });
      setMeanings({ 0: "main", 1: "pattern" });
      setOverrides({});
      setSymbolDefinitions(
        Array.from({ length: specialSymbolCount }, (_, id) => ({
          id,
          meaning:
            symbolDefinitions[id]?.meaning ??
            DEFAULT_CATEGORY_MEANINGS[id % DEFAULT_CATEGORY_MEANINGS.length],
          sampleIndices: [],
        })),
      );
      setActiveDefinitionId(specialSymbolCount ? 0 : null);
      setTemplatesApplied(specialSymbolCount === 0);
      setPreviewMode(specialSymbolCount ? "source" : "interpreted");
      setStep(3);
      setMessage(
        specialSymbolCount
          ? "Choose what each visual category means, then click a clear example in the original chart. Several different categories can all mean Main colour."
          : "No taught categories selected. Check the two automatic colour groups before importing.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The chart cells could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateSymbolMeaning(id: number, meaning: SymbolMeaning) {
    setSymbolDefinitions((current) =>
      current.map((definition) =>
        definition.id === id ? { ...definition, meaning } : definition,
      ),
    );
    if (templatesApplied)
      setMeanings((current) => ({ ...current, [id + 2]: meaning }));
  }

  function addSymbolSample(cellIndex: number) {
    if (activeDefinitionId === null || !analysis) return;
    setSymbolDefinitions((current) =>
      current.map((definition) =>
        definition.id === activeDefinitionId
          ? {
              ...definition,
              sampleIndices: [
                ...definition.sampleIndices.filter(
                  (index) => index !== cellIndex,
                ),
                cellIndex,
              ],
            }
          : definition,
      ),
    );
    setTemplatesApplied(false);
    setPreviewMode("source");
    const definition = symbolDefinitions.find(
      (candidate) => candidate.id === activeDefinitionId,
    );
    const label =
      SYMBOL_OPTIONS.find((option) => option.value === definition?.meaning)
        ?.label ?? "this category";
    setMessage(
      `Added an example for ${label}. Add another example, choose the next category, or identify all matches.`,
    );
  }

  function removeSymbolSample(definitionId: number, cellIndex: number) {
    setSymbolDefinitions((current) =>
      current.map((definition) =>
        definition.id === definitionId
          ? {
              ...definition,
              sampleIndices: definition.sampleIndices.filter(
                (index) => index !== cellIndex,
              ),
            }
          : definition,
      ),
    );
    setTemplatesApplied(false);
    setPreviewMode("source");
  }

  function identifySymbolMatches() {
    if (
      !analysis ||
      symbolDefinitions.some((definition) => !definition.sampleIndices.length)
    )
      return;
    const colorAssignments = [...analysis.colorAssignments];
    const assignments = [...colorAssignments];
    const colourDefinitions = symbolDefinitions.filter(
      (definition) =>
        definition.meaning === "main" || definition.meaning === "pattern",
    );
    const stitchDefinitions = symbolDefinitions.filter(
      (definition) =>
        definition.meaning !== "main" && definition.meaning !== "pattern",
    );
    const manualOnlyDefinitions = stitchDefinitions.filter((definition) =>
      definition.sampleIndices.every(
        (sampleIndex) => symbolInk(analysis.features[sampleIndex]) < 0.018,
      ),
    );
    const matchedCells = new Set<number>();

    // Taught colour categories augment the automatic two-colour split. This lets
    // several visually different printed fills all deliberately mean Main colour.
    analysis.baseColors.forEach((baseColor, cellIndex) => {
      const candidates = colourDefinitions
        .map((definition) => ({
          definition,
          distance: Math.min(
            ...definition.sampleIndices.map((sampleIndex) =>
              colorDistance(baseColor, analysis.baseColors[sampleIndex]),
            ),
          ),
        }))
        .sort((first, second) => first.distance - second.distance);
      const exactDefinition = colourDefinitions.find((definition) =>
        definition.sampleIndices.includes(cellIndex),
      );
      const best = exactDefinition
        ? { definition: exactDefinition, distance: 0 }
        : candidates[0];
      if (!best || best.distance > 0.18) return;
      const colourGroup = best.definition.meaning === "pattern" ? 1 : 0;
      colorAssignments[cellIndex] = colourGroup;
      assignments[cellIndex] = best.definition.id + 2;
      matchedCells.add(cellIndex);
    });

    // Printed stitch symbols override a cell's action but keep the yarn colour
    // established above. A cell may therefore be both a colour and stitch example.
    analysis.features.forEach((feature, cellIndex) => {
      const exactDefinition = stitchDefinitions.find((definition) =>
        definition.sampleIndices.includes(cellIndex),
      );
      if (exactDefinition) {
        assignments[cellIndex] = exactDefinition.id + 2;
        matchedCells.add(cellIndex);
        return;
      }
      const candidates = stitchDefinitions
        .filter((definition) =>
          definition.sampleIndices.some(
            (sampleIndex) => symbolInk(analysis.features[sampleIndex]) >= 0.018,
          ),
        )
        .map((definition) => ({
          definition,
          distance: Math.min(
            ...definition.sampleIndices.map((sampleIndex) =>
              symbolDistance(feature, analysis.features[sampleIndex]),
            ),
          ),
        }))
        .sort((first, second) => first.distance - second.distance);
      const best = candidates[0];
      if (!best) return;
      const second = candidates[1];
      const clearlyNearest =
        !second ||
        best.distance < 0.004 ||
        best.distance <= second.distance * 0.78;
      if (best.distance <= MATCHING_SYMBOL_THRESHOLD && clearlyNearest) {
        assignments[cellIndex] = best.definition.id + 2;
        matchedCells.add(cellIndex);
      }
    });
    const groups: SymbolGroup[] = [0, 1].map((id) => ({
      ...analysis.groups.find((group) => group.id === id)!,
      count: assignments.filter((assignment) => assignment === id).length,
    }));
    symbolDefinitions.forEach((definition) =>
      groups.push({
        id: definition.id + 2,
        count: assignments.filter(
          (assignment) => assignment === definition.id + 2,
        ).length,
        samples: definition.sampleIndices.map((index) => ({
          index,
          sampleUrl: featureImage(analysis.features[index]),
        })),
        darkness: 0,
      }),
    );
    setAnalysis({ ...analysis, assignments, colorAssignments, groups });
    setMeanings((current) => ({
      ...current,
      ...Object.fromEntries(
        symbolDefinitions.map((definition) => [
          definition.id + 2,
          definition.meaning,
        ]),
      ),
    }));
    setOverrides({});
    setActiveDefinitionId(null);
    setTemplatesApplied(true);
    setPreviewMode("interpreted");
    setMessage(
      `Identified ${matchedCells.size} taught ${matchedCells.size === 1 ? "cell" : "cells"}. Untaught cells kept the automatic colour interpretation.${manualOnlyDefinitions.length ? " A completely filled or blank stitch example has no distinct printed mark, so KnitPlot kept only the examples you selected rather than guessing." : ""}`,
    );
  }

  function correctCell(cellIndex: number) {
    if (!analysis) return;
    const affected =
      correctionScope === "single"
        ? [cellIndex]
        : (correctionMeaning === "main" || correctionMeaning === "pattern"
            ? analysis.baseColors
            : analysis.features
          )
            .map((feature, index) => ({
              index,
              distance:
                correctionMeaning === "main" || correctionMeaning === "pattern"
                  ? colorDistance(analysis.baseColors[cellIndex], feature)
                  : symbolDistance(analysis.features[cellIndex], feature),
            }))
            .filter(
              (candidate) =>
                candidate.distance <=
                (correctionMeaning === "main" || correctionMeaning === "pattern"
                  ? 0.18
                  : MATCHING_SYMBOL_THRESHOLD),
            )
            .map((candidate) => candidate.index);
    setOverrides((current) => {
      const next = { ...current };
      affected.forEach((index) => {
        next[index] = correctionMeaning;
      });
      return next;
    });
    const label =
      SYMBOL_OPTIONS.find((option) => option.value === correctionMeaning)
        ?.label ?? correctionMeaning;
    setMessage(
      correctionScope === "single"
        ? `Corrected this cell to ${label}.`
        : `Corrected ${affected.length} closely matching ${affected.length === 1 ? "cell" : "cells"} to ${label}. Check the preview and click any remaining symbols.`,
    );
  }

  function finishImport(openKnitMode = false) {
    if (!result) return;
    onImport(
      palette,
      result.cells,
      result.stitchActions,
      construction,
      fileName,
    );
    onClose();
    if (openKnitMode) window.setTimeout(onOpenKnitMode, 0);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop pattern-import-backdrop" role="presentation">
      <section
        className="import-dialog pattern-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pattern-import-title"
      >
        <div className="import-dialog-heading">
          <div>
            <p className="eyebrow">Import an existing pattern</p>
            <h1 id="pattern-import-title">Bring a chart into KnitPlot</h1>
          </div>
          <button
            className="close-dialog"
            aria-label="Close pattern chart import"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="pattern-import-steps" aria-label="Import progress">
          <span className={step >= 1 ? "active" : ""}>1 · Pattern page</span>
          <span className={step >= 2 ? "active" : ""}>2 · Crop and grid</span>
          <span className={step >= 3 ? "active" : ""}>3 · Symbols</span>
        </div>

        {step === 1 ? (
          <div className="pattern-import-stage">
            <div className="pattern-file-prompt">
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void chooseFile(file);
                }}
              />
              <button
                className="primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {source ? "Choose a different file" : "Choose PDF or image"}
              </button>
              <p>
                PDF pages are rendered and analysed in your browser. The source
                pattern is never uploaded or saved by KnitPlot.
              </p>
            </div>
            {source ? (
              <>
                {pageCount > 1 ? (
                  <div className="pattern-page-controls">
                    <button
                      onClick={() => void renderPdfPage(page - 1)}
                      disabled={busy || page <= 1}
                    >
                      Previous page
                    </button>
                    <label>
                      Page{" "}
                      <input
                        type="number"
                        min="1"
                        max={pageCount}
                        value={page}
                        onChange={(event) => {
                          const next = clamp(
                            Number(event.target.value),
                            1,
                            pageCount,
                          );
                          void renderPdfPage(next);
                        }}
                      />{" "}
                      of {pageCount}
                    </label>
                    <button
                      onClick={() => void renderPdfPage(page + 1)}
                      disabled={busy || page >= pageCount}
                    >
                      Next page
                    </button>
                    <span>Last page suggested</span>
                  </div>
                ) : null}
                <div className="pattern-page-preview">
                  <img src={source.url} alt={source.label} />
                </div>
                <div className="import-actions">
                  <button onClick={onClose}>Cancel</button>
                  <button className="primary-button" onClick={() => setStep(2)}>
                    Use this page
                  </button>
                </div>
              </>
            ) : null}
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
                    onClick={() =>
                      setPageZoom((current) => clamp(current - 25, 50, 300))
                    }
                    disabled={pageZoom <= 50}
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="10"
                    value={pageZoom}
                    onChange={(event) =>
                      setPageZoom(Number(event.target.value))
                    }
                  />
                  <button
                    type="button"
                    aria-label="Zoom page in"
                    onClick={() =>
                      setPageZoom((current) => clamp(current + 25, 50, 300))
                    }
                    disabled={pageZoom >= 300}
                  >
                    +
                  </button>
                  <span>{pageZoom}%</span>
                </label>
                <button onClick={() => setPageZoom(100)}>Reset zoom</button>
              </div>
              <div className="pattern-crop-viewport">
                <div
                  ref={previewRef}
                  className="pattern-crop-preview"
                  style={{
                    width: `${pageZoom}%`,
                    aspectRatio: `${source.width} / ${source.height}`,
                  }}
                  onPointerMove={dragCrop}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                >
                  <img
                    src={source.url}
                    alt="Selected pattern page"
                    draggable={false}
                  />
                  <div
                    className="pattern-crop-box"
                    style={{
                      left: `${crop.x}%`,
                      top: `${crop.y}%`,
                      width: `${crop.width}%`,
                      height: `${crop.height}%`,
                      gridTemplateColumns: `repeat(${columns}, 1fr)`,
                      gridTemplateRows: `repeat(${rows}, 1fr)`,
                    }}
                    onPointerDown={(event) => beginCropDrag(event, "move")}
                  >
                    <span
                      className="pattern-grid-overlay"
                      style={{
                        backgroundSize: `${100 / columns}% ${100 / rows}%`,
                      }}
                    />
                    <span
                      className="pattern-crop-handle"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        beginCropDrag(event, "resize");
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="pattern-crop-closeup">
              <strong>Exact crop used for analysis</strong>
              {cropPreviewUrl ? (
                <div
                  className="pattern-crop-canonical"
                  style={{
                    aspectRatio: `${source.width * crop.width} / ${source.height * crop.height}`,
                    width: `${Math.max(20, (pageZoom * crop.width) / 100)}%`,
                  }}
                >
                  <img
                    src={cropPreviewUrl}
                    alt="Exact selected chart area"
                    draggable={false}
                  />
                  <span
                    className="pattern-grid-overlay"
                    style={{
                      backgroundSize: `${100 / columns}% ${100 / rows}%`,
                    }}
                  />
                </div>
              ) : (
                <span className="pattern-crop-rendering">
                  Updating exact crop…
                </span>
              )}
            </div>
            <aside className="pattern-grid-controls">
              <label>
                Chart name
                <input
                  value={fileName}
                  maxLength={200}
                  onChange={(event) => setFileName(event.target.value)}
                />
              </label>
              <div className="two-fields">
                <label>
                  Stitches
                  <input
                    type="number"
                    min="2"
                    max={MAX_CHART_STITCHES}
                    value={columnsDraft}
                    onChange={(event) =>
                      updateGridDimension("columns", event.target.value)
                    }
                    onBlur={() => finishGridDimension("columns")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
                <label>
                  Rows
                  <input
                    type="number"
                    min="2"
                    max={MAX_CHART_ROWS}
                    value={rowsDraft}
                    onChange={(event) =>
                      updateGridDimension("rows", event.target.value)
                    }
                    onBlur={() => finishGridDimension("rows")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>
              </div>
              <div className="pattern-snap-actions">
                <button
                  className="primary-button"
                  onClick={() => void snapGridToChart()}
                  disabled={busy || !gridDimensionsValid}
                >
                  Snap grid to chart
                </button>
                {cropBeforeSnap ? (
                  <button
                    onClick={() => {
                      setCrop(cropBeforeSnap);
                      setCropBeforeSnap(null);
                      setMessage("Returned to your crop from before snapping.");
                    }}
                  >
                    Undo snap
                  </button>
                ) : null}
              </div>
              <button onClick={() => void rotateSource()} disabled={busy}>
                Rotate page 90°
              </button>
              <button
                onClick={() => {
                  setCrop({ x: 0, y: 0, width: 100, height: 100 });
                  setCropBeforeSnap(null);
                }}
              >
                Use whole page
              </button>
              <div className="pattern-crop-sliders">
                <label>
                  Left edge
                  <input
                    type="range"
                    min="0"
                    max={100 - crop.width}
                    step="0.1"
                    value={crop.x}
                    onChange={(event) =>
                      setCrop((current) => ({
                        ...current,
                        x: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Top edge
                  <input
                    type="range"
                    min="0"
                    max={100 - crop.height}
                    step="0.1"
                    value={crop.y}
                    onChange={(event) =>
                      setCrop((current) => ({
                        ...current,
                        y: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Width
                  <input
                    type="range"
                    min="5"
                    max={100 - crop.x}
                    step="0.1"
                    value={crop.width}
                    onChange={(event) =>
                      setCrop((current) => ({
                        ...current,
                        width: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Height
                  <input
                    type="range"
                    min="5"
                    max={100 - crop.y}
                    step="0.1"
                    value={crop.height}
                    onChange={(event) =>
                      setCrop((current) => ({
                        ...current,
                        height: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Visual categories to teach
                <select
                  value={specialSymbolCount}
                  onChange={(event) =>
                    changeSpecialSymbolCount(Number(event.target.value))
                  }
                >
                  {Array.from({ length: 15 }, (_, count) => (
                    <option key={count} value={count}>
                      {count === 0 ? "None" : count}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Worked
                <select
                  value={construction}
                  onChange={(event) =>
                    setConstruction(
                      event.target
                        .value as ChartDocument["instructions"]["construction"],
                    )
                  }
                >
                  <option value="round">In the round</option>
                  <option value="flat">Flat</option>
                </select>
              </label>
              <label>
                First row appears
                <select
                  value={firstRow}
                  onChange={(event) =>
                    setFirstRow(event.target.value as "bottom" | "top")
                  }
                >
                  <option value="bottom">At the bottom</option>
                  <option value="top">At the top</option>
                </select>
              </label>
              <p>
                Enter the printed stitch and row counts, then draw a rough box
                around the chart and choose Snap grid to chart. Check that every
                overlay cell matches one printed chart cell before continuing.
              </p>
            </aside>
            <div className="import-actions pattern-wide-actions">
              <button onClick={() => setStep(1)}>Back</button>
              <button
                className="primary-button"
                onClick={() => void analyseSymbols()}
                disabled={busy || !gridDimensionsValid}
              >
                {specialSymbolCount
                  ? "Teach KnitPlot the chart key"
                  : "Review chart colours"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && analysis && result && displayResult && source ? (
          <div className="pattern-import-stage pattern-symbol-stage">
            <div className="pattern-symbol-controls">
              <div className="pattern-teach-heading">
                <h2>Teach KnitPlot the chart key</h2>
                <p>
                  Choose what each visual category means, then click a clear
                  example. Different categories may share a meaning—for example,
                  three printed size colours can all be Main colour.
                </p>
              </div>
              <div className="pattern-colour-groups">
                <strong>Automatic colour fallback</strong>
                {[0, 1].map((groupId) => (
                  <label key={groupId}>
                    Colour group {groupId + 1}
                    <span>
                      {
                        analysis.colorAssignments.filter(
                          (assignment) => assignment === groupId,
                        ).length
                      }{" "}
                      cells
                    </span>
                    <select
                      value={
                        meanings[groupId] ??
                        (groupId === 0 ? "main" : "pattern")
                      }
                      onChange={(event) =>
                        setMeanings((current) => ({
                          ...current,
                          [groupId]: event.target.value as "main" | "pattern",
                        }))
                      }
                    >
                      <option value="main">Main colour</option>
                      <option value="pattern">Contrast colour</option>
                    </select>
                  </label>
                ))}
              </div>
              <div className="pattern-symbol-list pattern-teach-list">
                {symbolDefinitions.map((definition, displayIndex) => (
                  <div
                    className={`pattern-teach-row ${activeDefinitionId === definition.id ? "active" : ""}`}
                    key={definition.id}
                  >
                    <div>
                      <strong>Category {displayIndex + 1}</strong>
                      <select
                        value={definition.meaning}
                        onChange={(event) =>
                          updateSymbolMeaning(
                            definition.id,
                            event.target.value as SymbolMeaning,
                          )
                        }
                      >
                        {SYMBOL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className={
                        activeDefinitionId === definition.id
                          ? "primary-button"
                          : ""
                      }
                      onClick={() => {
                        setActiveDefinitionId(definition.id);
                        setPreviewMode("source");
                      }}
                    >
                      {activeDefinitionId === definition.id
                        ? "Click examples in chart"
                        : definition.sampleIndices.length
                          ? "Add another example"
                          : "Pick an example"}
                    </button>
                    <div className="pattern-template-samples">
                      {definition.sampleIndices.map(
                        (sampleIndex, sampleNumber) => (
                          <button
                            key={sampleIndex}
                            aria-label={`Remove example ${sampleNumber + 1} for category ${displayIndex + 1}`}
                            title="Remove this example"
                            onClick={() =>
                              removeSymbolSample(definition.id, sampleIndex)
                            }
                          >
                            {definition.meaning === "main" ||
                            definition.meaning === "pattern" ? (
                              <i
                                className="pattern-template-colour"
                                style={{
                                  background: colorSwatch(
                                    analysis.baseColors[sampleIndex],
                                  ),
                                }}
                              />
                            ) : (
                              <img
                                src={featureImage(
                                  analysis.features[sampleIndex],
                                )}
                                alt={`Example ${sampleNumber + 1} for category ${displayIndex + 1}`}
                              />
                            )}
                            <span>×</span>
                          </button>
                        ),
                      )}
                      {!definition.sampleIndices.length ? (
                        <span>No example yet</span>
                      ) : null}
                    </div>
                    {templatesApplied ? (
                      <small>
                        {
                          analysis.assignments.filter(
                            (assignment) => assignment === definition.id + 2,
                          ).length
                        }{" "}
                        matches found
                      </small>
                    ) : null}
                  </div>
                ))}
              </div>
              {symbolDefinitions.length ? (
                <button
                  className="primary-button pattern-identify-button"
                  disabled={symbolDefinitions.some(
                    (definition) => !definition.sampleIndices.length,
                  )}
                  onClick={identifySymbolMatches}
                >
                  Identify matching cells
                </button>
              ) : null}
            </div>
            <div className="pattern-result-preview">
              <div className="pattern-result-heading">
                <div>
                  <h2>Live chart preview</h2>
                  <p>
                    {previewMode === "source"
                      ? "This is the exact cropped raster KnitPlot analyzed."
                      : "Updates as you change the chart-key choices."}
                  </p>
                </div>
                <div
                  className="pattern-result-toggle"
                  aria-label="Chart review view"
                >
                  <button
                    className={previewMode === "source" ? "active" : ""}
                    onClick={() => setPreviewMode("source")}
                  >
                    Original symbols
                  </button>
                  <button
                    className={previewMode === "interpreted" ? "active" : ""}
                    onClick={() => setPreviewMode("interpreted")}
                    disabled={!templatesApplied}
                  >
                    Live KnitPlot preview
                  </button>
                </div>
              </div>
              {templatesApplied ? (
                <div className="pattern-correction-controls">
                  <strong>Fix a symbol</strong>
                  <label>
                    Set to{" "}
                    <select
                      value={correctionMeaning}
                      onChange={(event) =>
                        setCorrectionMeaning(
                          event.target.value as SymbolMeaning,
                        )
                      }
                    >
                      {SYMBOL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    When clicked{" "}
                    <select
                      value={correctionScope}
                      onChange={(event) =>
                        setCorrectionScope(
                          event.target.value as "matching" | "single",
                        )
                      }
                    >
                      <option value="matching">
                        Fix every matching symbol
                      </option>
                      <option value="single">Fix only this cell</option>
                    </select>
                  </label>
                  {Object.keys(overrides).length ? (
                    <button
                      onClick={() => {
                        setOverrides({});
                        setMessage("Manual symbol corrections cleared.");
                      }}
                    >
                      Clear corrections
                    </button>
                  ) : null}
                  <p>
                    Choose the right meaning, then click a misidentified cell in
                    the chart. Start with “every matching symbol” for repeated
                    triangles or other printed symbols.
                  </p>
                </div>
              ) : (
                <p className="pattern-picking-hint">
                  Select a category on the left, then click its clearest example
                  in the original chart.
                </p>
              )}
              <div className="pattern-result-scroll">
                <div
                  className={`pattern-result-grid ${previewMode === "source" ? "show-source" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    aspectRatio: `${source.width * crop.width} / ${source.height * crop.height}`,
                  }}
                >
                  {previewMode === "source" ? (
                    <img
                      className="pattern-result-source-image"
                      src={analysis.sourcePreviewUrl}
                      alt="Exact chart image used for analysis"
                    />
                  ) : null}
                  {displayResult.cells.flatMap((cellRow, rowIndex) =>
                    cellRow.map((colorId, columnIndex) => {
                      const action =
                        displayResult.stitchActions[rowIndex][columnIndex];
                      const cellIndex = rowIndex * columns + columnIndex;
                      const isTemplateSample = symbolDefinitions.some(
                        (definition) =>
                          definition.sampleIndices.includes(cellIndex),
                      );
                      const picking =
                        activeDefinitionId !== null && previewMode === "source";
                      return (
                        <button
                          type="button"
                          key={`${rowIndex}-${columnIndex}`}
                          className={`${action === "no-stitch" ? "no-stitch" : ""} ${overrides[cellIndex] ? "corrected" : ""} ${isTemplateSample ? "template-sample" : ""}`}
                          style={{
                            background:
                              previewMode === "source"
                                ? "transparent"
                                : action === "no-stitch"
                                  ? "#303632"
                                  : action !== "knit"
                                    ? "#ffffff"
                                    : palette.find(
                                        (color) => color.id === colorId,
                                      )?.hex,
                          }}
                          title={
                            picking
                              ? "Use this cell as a category example"
                              : `${action === "knit" ? "Knit" : action.toUpperCase()} · click to correct`
                          }
                          onClick={() =>
                            picking
                              ? addSymbolSample(cellIndex)
                              : correctCell(cellIndex)
                          }
                        >
                          {previewMode === "interpreted"
                            ? previewActionSymbol(action)
                            : ""}
                        </button>
                      );
                    }),
                  )}
                </div>
              </div>
              <p>
                {templatesApplied
                  ? "Use Original symbols to correct any missed marks. Switch to KnitPlot interpretation to verify the result before importing."
                  : "Example cells are outlined in orange. Colour categories match similar fills; stitch categories only match closely resembling marks."}
              </p>
            </div>
            <div className="import-actions pattern-wide-actions">
              <button onClick={() => setStep(2)}>Back to crop</button>
              <button
                onClick={() => finishImport(false)}
                disabled={!templatesApplied}
              >
                Open in editor
              </button>
              <button
                className="primary-button"
                onClick={() => finishImport(true)}
                disabled={!templatesApplied}
              >
                Import and start Knit Mode
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="pattern-import-message" role="status">
            {busy ? (
              <span className="pattern-spinner" aria-hidden="true" />
            ) : null}
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
