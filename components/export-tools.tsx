"use client";
import { stringifyKnitplot } from "@/lib/yoke-program-wire";

import Link from "next/link";
import { ChangeEvent, RefObject, useEffect, useRef, useState } from "react";
import {
  cellAspectRatio,
  ChartDocument,
  cloneDocument,
  contrastTextColor,
  hasStructuralStitches,
  stitchActionAt,
  stitchActionSymbol,
  chartCellDisplayColor,
} from "@/lib/chart";
import { readProject } from "@/lib/project-file";
import { stitchBitmap } from "@/lib/stitch-bitmap";
import { recordUsage, type DownloadFormat } from "@/lib/usage-analytics";
import { canvasBlob, downloadBlob, fileName } from "@/lib/browser-download";
import { DraftChartLinkDialog } from "./draft-chart-link-dialog";

type Props = {
  document: ChartDocument;
  tabId: string;
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  onOpenProject: (document: ChartDocument) => void;
  accountsEnabled: boolean;
  signedIn: boolean;
  cloudId?: string;
  cloudSaveState: "idle" | "saving" | "saved" | "error";
  cloudSaveMessage: string;
  onSaveToCloud: () => Promise<void>;
  onImportPattern: () => void;
  onNewBlank?: () => void;
  onNewYoke?: () => void;
  tabsFull?: boolean;
  tourOpen?: boolean;
  onNavigateAway?: (event: { preventDefault(): void }) => void;
};

type ProjectFile = {
  format: "colorwork-chart";
  version: 2;
  document: ChartDocument;
};

function renderChart(document: ChartDocument, showGrid: boolean) {
  const aspect = cellAspectRatio(document);
  const maximumChartDimension = 4000;
  const cellHeight = Math.min(
    24,
    maximumChartDimension / Math.max(document.width * aspect, document.height),
  );
  const cellWidth = cellHeight * aspect;
  const left = 54;
  const top = 72;
  const right = 20;
  const bottom = 42;
  const chartWidth = document.width * cellWidth;
  const chartHeight = document.height * cellHeight;
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(640, Math.ceil(left + chartWidth + right));
  canvas.height = Math.max(1, Math.ceil(top + chartHeight + bottom));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The chart image could not be created.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#202522";
  context.font = "bold 20px Arial, sans-serif";
  context.fillText(document.name || "Untitled chart", left, 27);
  context.fillStyle = "#69716c";
  context.font = "12px Arial, sans-serif";
  context.fillText(
    `${document.width} stitches × ${document.height} rows · Gauge ${document.gaugeStitches} sts × ${document.gaugeRows} rows over ${document.gaugeMeasure} ${document.gaugeUnit}`,
    left,
    47,
  );

  const palette = new Map(
    document.palette.map((color) => [color.id, color.hex]),
  );
  for (let row = 0; row < document.height; row += 1) {
    for (let column = 0; column < document.width; column += 1) {
      const action = stitchActionAt(document, row, column);
      const yarnColor = palette.get(document.cells[row][column]);
      context.fillStyle = chartCellDisplayColor(
        document,
        row,
        column,
        yarnColor,
      );
      context.fillRect(
        left + column * cellWidth,
        top + row * cellHeight,
        cellWidth,
        cellHeight,
      );
      if (action !== "knit") {
        context.fillStyle = contrastTextColor(
          chartCellDisplayColor(document, row, column, yarnColor),
        );
        context.font = `bold ${Math.max(6, Math.min(10, cellHeight * 0.4))}px Arial, sans-serif`;
        context.textAlign = "center";
        context.fillText(
          stitchActionSymbol(action),
          left + (column + 0.5) * cellWidth,
          top + (row + 0.68) * cellHeight,
        );
        context.textAlign = "left";
      }
    }
  }

  for (let column = 0; showGrid && column <= document.width; column += 1) {
    context.beginPath();
    context.strokeStyle =
      column % 5 === 0 ? "rgba(28,31,29,.72)" : "rgba(28,31,29,.42)";
    context.lineWidth = column % 5 === 0 ? 1.5 : 1;
    const x = left + column * cellWidth;
    context.moveTo(x, top);
    context.lineTo(x, top + chartHeight);
    context.stroke();
  }
  for (let row = 0; showGrid && row <= document.height; row += 1) {
    context.beginPath();
    context.strokeStyle =
      row % 5 === 0 ? "rgba(28,31,29,.72)" : "rgba(28,31,29,.42)";
    context.lineWidth = row % 5 === 0 ? 1.5 : 1;
    const y = top + row * cellHeight;
    context.moveTo(left, y);
    context.lineTo(left + chartWidth, y);
    context.stroke();
  }

  context.fillStyle = "#4f5752";
  context.font = "10px Arial, sans-serif";
  context.textAlign = "center";
  const columnStep = document.width > 40 ? 10 : 5;
  for (
    let column = columnStep;
    column <= document.width;
    column += columnStep
  ) {
    context.fillText(
      String(column),
      left + (column - 0.5) * cellWidth,
      top - 10,
    );
  }
  context.textAlign = "right";
  const rowStep = document.height > 24 ? 5 : 1;
  for (let row = 0; row < document.height; row += 1) {
    const chartRow = document.height - row;
    if (chartRow % rowStep === 0) {
      context.fillText(
        String(chartRow),
        left - 8,
        top + (row + 0.65) * cellHeight,
      );
    }
  }

  context.textAlign = "left";
  context.fillStyle = "#69716c";
  context.fillText(
    hasStructuralStitches(document)
      ? "Shaded squares are not stitches; special stitch symbols are worked as shown."
      : "Each square represents one stitch.",
    left,
    top + chartHeight + 25,
  );
  return canvas;
}

export function ExportTools({
  document,
  tabId,
  previewCanvasRef,
  onOpenProject,
  accountsEnabled,
  signedIn,
  cloudId,
  cloudSaveState,
  cloudSaveMessage,
  onSaveToCloud,
  onImportPattern,
  onNewBlank,
  onNewYoke,
  tabsFull,
  tourOpen = false,
  onNavigateAway,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const closeMenu = () => setOpen(false);
  const [choosingChartImage, setChoosingChartImage] = useState(false);
  const [confirmingBitmap, setConfirmingBitmap] = useState(false);
  const [noStitchColorId, setNoStitchColorId] = useState("");
  const [message, setMessage] = useState("");
  const hasNoStitch = document.stitchActions?.some((row) =>
    row.includes("no-stitch"),
  );

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  function saveProject() {
    const project: ProjectFile = {
      format: "colorwork-chart",
      version: 2,
      document: cloneDocument(document),
    };
    downloadBlob(
      new Blob([stringifyKnitplot(project, 2)], {
        type: "application/json",
      }),
      fileName(document.name, "knitplot"),
    );
    recordDownload("knitplot");
    setMessage("Editable KnitPlot file downloaded.");
  }

  function recordDownload(format: DownloadFormat) {
    recordUsage(
      {
        account: signedIn ? "signed_in" : "guest",
        chart_type: document.yoke ? "yoke" : "regular",
      },
      format,
    );
  }

  async function downloadChart(showGrid: boolean) {
    try {
      downloadBlob(
        await canvasBlob(renderChart(document, showGrid)),
        fileName(document.name, showGrid ? "chart.png" : "chart-no-grid.png"),
      );
      setMessage("Chart downloaded.");
      recordDownload(showGrid ? "chart_grid" : "chart_no_grid");
    } catch {
      setMessage("The chart image could not be created.");
    }
  }

  async function downloadBitmap() {
    try {
      const bitmap = stitchBitmap(document, noStitchColorId);
      const canvas = window.document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The stitch bitmap could not be created.");
      const image = context.createImageData(bitmap.width, bitmap.height);
      image.data.set(bitmap.pixels);
      context.putImageData(image, 0, 0);
      downloadBlob(
        await canvasBlob(canvas),
        fileName(document.name, "stitch-bitmap.png"),
      );
      setConfirmingBitmap(false);
      recordDownload("stitch_bitmap");
      setMessage(
        `Stitch bitmap downloaded: ${bitmap.width} × ${bitmap.height} pixels.`,
      );
    } catch {
      setMessage("The stitch bitmap could not be created.");
    }
  }

  async function downloadPreview() {
    const canvas = previewCanvasRef.current;
    if (
      !canvas ||
      !canvas.width ||
      !canvas.height ||
      canvas.dataset.previewState === "rendering"
    ) {
      setMessage(
        !canvas && document.yoke
          ? "Choose an available view in Knitted up before downloading the preview."
          : "The knitted preview is still loading.",
      );
      return;
    }
    if (canvas.dataset.previewState === "error") {
      setMessage("Refresh the knitted preview before downloading it.");
      return;
    }
    try {
      downloadBlob(
        await canvasBlob(canvas),
        fileName(document.name, "knitted.png"),
      );
      setMessage("Knitted preview downloaded.");
      recordDownload("knitted_preview");
    } catch {
      setMessage("The knitted preview could not be downloaded.");
    }
  }

  async function openProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("That project file is too large.");
      return;
    }
    try {
      const nextDocument = readProject(JSON.parse(await file.text()));
      onOpenProject(nextDocument);
      setMessage("Project opened.");
      closeMenu();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The project could not be opened.",
      );
    }
  }

  return (
    <div className="file-actions" data-tour="file-menu">
      <div className="file-menu" ref={menuRef}>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".knitplot,.knitplot-yoke,.colorwork.json,application/json"
          onChange={openProject}
        />
        <button
          ref={fileButtonRef}
          className="secondary-button"
          aria-expanded={open || tourOpen}
          onClick={() => {
            setOpen(!open);
            setChoosingChartImage(false);
            setConfirmingBitmap(false);
            setNoStitchColorId("");
            setMessage("");
          }}
        >
          File
        </button>
        {open || tourOpen ? (
          <div
            className="file-menu-popover"
            role="menu"
            aria-label="Project and export options"
          >
            <p className="file-menu-section-label">New</p>
            <button
              role="menuitem"
              disabled={tabsFull || !onNewBlank}
              onClick={() => {
                closeMenu();
                onNewBlank?.();
              }}
            >
              Blank chart
            </button>
            <button
              role="menuitem"
              data-tour="new-circular-yoke"
              disabled={tabsFull || !onNewYoke}
              onClick={() => {
                closeMenu();
                onNewYoke?.();
              }}
            >
              Circular yoke
            </button>
            <span className="file-menu-divider" />
            <p className="file-menu-section-label">On this device</p>
            <button
              role="menuitem"
              disabled={!!document.yoke}
              onClick={() => {
                closeMenu();
                onImportPattern();
              }}
            >
              Import chart from pattern PDF or image
            </button>
            <button role="menuitem" onClick={saveProject}>
              Download editable KnitPlot file
            </button>
            <button role="menuitem" onClick={() => inputRef.current?.click()}>
              Open KnitPlot file
            </button>
            {accountsEnabled ? (
              <>
                <span className="file-menu-divider" />
                <p className="file-menu-section-label">My Charts</p>
                {signedIn ? (
                  <>
                    {cloudId ? (
                      <p
                        className={`file-menu-cloud-status ${cloudSaveState}`}
                        role="status"
                        title={cloudSaveMessage}
                      >
                        {cloudSaveState === "saving"
                          ? "Saving changes…"
                          : cloudSaveState === "error"
                            ? "Save failed"
                            : "Saved · changes save automatically"}
                      </p>
                    ) : (
                      <button
                        role="menuitem"
                        onClick={() => void onSaveToCloud()}
                        disabled={cloudSaveState === "saving"}
                      >
                        {cloudSaveState === "saving"
                          ? "Saving…"
                          : cloudSaveState === "error"
                            ? "Try saving to My Charts again"
                            : "Save to My Charts"}
                      </button>
                    )}
                    {cloudId &&
                    cloudSaveState !== "saving" &&
                    cloudSaveState !== "error" ? (
                      <Link
                        role="menuitem"
                        href={`/chart-club/share/${cloudId}`}
                        onNavigate={onNavigateAway}
                      >
                        Share to Chart Club
                      </Link>
                    ) : (
                      <button
                        role="menuitem"
                        onClick={() =>
                          setMessage(
                            cloudId
                              ? "Let your changes save before sharing this chart."
                              : "Save this chart to My Charts first, then share it here.",
                          )
                        }
                      >
                        Share to Chart Club
                      </button>
                    )}
                  </>
                ) : (
                  <Link
                    role="menuitem"
                    href="/sign-in"
                    onNavigate={onNavigateAway}
                  >
                    Sign in to use My Charts
                  </Link>
                )}
              </>
            ) : null}
            <span className="file-menu-divider" />
            <p className="file-menu-section-label">Export</p>
            <button
              role="menuitem"
              onClick={() => {
                closeMenu();
                setShareOpen(true);
              }}
            >
              Share a link
            </button>
            <button
              role="menuitem"
              aria-expanded={choosingChartImage}
              onClick={() => setChoosingChartImage((value) => !value)}
            >
              {document.yoke
                ? "Download repeat chart image"
                : "Download chart image"}
            </button>
            {choosingChartImage ? (
              <div
                className="file-menu-export-options"
                role="group"
                aria-label="Chart image options"
              >
                <button
                  role="menuitem"
                  onClick={() => void downloadChart(true)}
                >
                  With grid
                </button>
                <button
                  role="menuitem"
                  onClick={() => void downloadChart(false)}
                >
                  Without grid
                </button>
              </div>
            ) : null}
            <button
              role="menuitem"
              aria-expanded={confirmingBitmap}
              onClick={() => {
                setMessage("");
                if (hasStructuralStitches(document)) {
                  setConfirmingBitmap((value) => !value);
                } else {
                  void downloadBitmap();
                }
              }}
            >
              Download stitch bitmap · 1 pixel per stitch
            </button>
            {confirmingBitmap ? (
              <div
                className="file-menu-bitmap-options"
                role="group"
                aria-label="Stitch bitmap options"
              >
                <p>
                  Yarn colours only. Stitch actions and shaping are not
                  included.
                </p>
                {hasNoStitch ? (
                  <label>
                    Fill no-stitch cells with
                    <select
                      value={noStitchColorId}
                      onChange={(event) =>
                        setNoStitchColorId(event.target.value)
                      }
                    >
                      <option value="">Choose a yarn colour</option>
                      {document.palette.map((color, index) => (
                        <option key={color.id} value={color.id}>
                          Colour {index + 1} · {color.hex}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  role="menuitem"
                  disabled={Boolean(
                    hasNoStitch &&
                    !document.palette.some(
                      (color) => color.id === noStitchColorId,
                    ),
                  )}
                  onClick={() => void downloadBitmap()}
                >
                  Download colour-only bitmap
                </button>
                <button
                  role="menuitem"
                  onClick={() => setConfirmingBitmap(false)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <button role="menuitem" onClick={downloadPreview}>
              Download knitted preview
            </button>
            {message ? (
              <p className="file-menu-message" role="status">
                {message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {shareOpen && (
        <DraftChartLinkDialog
          chart={document}
          tabId={tabId}
          key={tabId}
          onClose={() => {
            setShareOpen(false);
            fileButtonRef.current?.focus();
          }}
        />
      )}
      <Link
        className="primary-button knit-mode-button chart-club-link"
        href="/chart-club"
        onNavigate={onNavigateAway}
      >
        Chart Club
      </Link>
      <Link
        className="secondary-button chart-club-link"
        href="/my-charts"
        onNavigate={onNavigateAway}
      >
        My Charts
      </Link>
    </div>
  );
}
