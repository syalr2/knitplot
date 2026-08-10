"use client";

import Link from "next/link";
import { ChangeEvent, RefObject, useEffect, useRef, useState } from "react";
import { cellAspectRatio, ChartDocument, cloneDocument } from "@/lib/chart";
import { readProject } from "@/lib/project-file";

type Props = {
  document: ChartDocument;
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  onOpenProject: (document: ChartDocument) => void;
  accountsEnabled: boolean;
  signedIn: boolean;
  cloudId?: string;
  cloudSaveState: "idle" | "saving" | "saved" | "error";
  cloudSaveMessage: string;
  onSaveToCloud: () => Promise<void>;
};

type ProjectFile = {
  format: "colorwork-chart";
  version: 1;
  document: ChartDocument;
};

function fileName(name: string, extension: string) {
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "colorwork-chart";
  return `${safeName}.${extension}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The image could not be created."));
    }, "image/png");
  });
}

function renderChart(document: ChartDocument) {
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

  const palette = new Map(document.palette.map((color) => [color.id, color.hex]));
  for (let row = 0; row < document.height; row += 1) {
    for (let column = 0; column < document.width; column += 1) {
      context.fillStyle = palette.get(document.cells[row][column]) ?? "#ffffff";
      context.fillRect(left + column * cellWidth, top + row * cellHeight, cellWidth, cellHeight);
    }
  }

  for (let column = 0; column <= document.width; column += 1) {
    context.beginPath();
    context.strokeStyle = column % 5 === 0 ? "rgba(28,31,29,.72)" : "rgba(28,31,29,.42)";
    context.lineWidth = column % 5 === 0 ? 1.5 : 1;
    const x = left + column * cellWidth;
    context.moveTo(x, top);
    context.lineTo(x, top + chartHeight);
    context.stroke();
  }
  for (let row = 0; row <= document.height; row += 1) {
    context.beginPath();
    context.strokeStyle = row % 5 === 0 ? "rgba(28,31,29,.72)" : "rgba(28,31,29,.42)";
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
  for (let column = columnStep; column <= document.width; column += columnStep) {
    context.fillText(String(column), left + (column - 0.5) * cellWidth, top - 10);
  }
  context.textAlign = "right";
  const rowStep = document.height > 24 ? 5 : 1;
  for (let row = 0; row < document.height; row += 1) {
    const chartRow = document.height - row;
    if (chartRow % rowStep === 0) {
      context.fillText(String(chartRow), left - 8, top + (row + 0.65) * cellHeight);
    }
  }

  context.textAlign = "left";
  context.fillStyle = "#69716c";
  context.fillText("Each square represents one stitch.", left, top + chartHeight + 25);
  return canvas;
}

export function ExportTools({
  document,
  previewCanvasRef,
  onOpenProject,
  accountsEnabled,
  signedIn,
  cloudId,
  cloudSaveState,
  cloudSaveMessage,
  onSaveToCloud,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  function saveProject() {
    const project: ProjectFile = { format: "colorwork-chart", version: 1, document: cloneDocument(document) };
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
      fileName(document.name, "knitplot"),
    );
    setMessage("Editable KnitPlot file downloaded.");
  }

  async function downloadChart() {
    try {
      downloadBlob(await canvasBlob(renderChart(document)), fileName(document.name, "chart.png"));
      setMessage("Chart downloaded.");
    } catch {
      setMessage("The chart image could not be created.");
    }
  }

  async function downloadPreview() {
    const canvas = previewCanvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) {
      setMessage("The knitted preview is still loading.");
      return;
    }
    try {
      downloadBlob(await canvasBlob(canvas), fileName(document.name, "knitted.png"));
      setMessage("Knitted preview downloaded.");
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
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The project could not be opened.");
    }
  }

  return (
    <div className="file-actions">
      <div className="file-menu" ref={menuRef}>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".knitplot,.colorwork.json,application/json" onChange={openProject} />
        <button className="secondary-button" aria-expanded={open} onClick={() => { setOpen((value) => !value); setMessage(""); }}>
          File
        </button>
        {open ? (
          <div className="file-menu-popover" role="menu" aria-label="Project and export options">
            <p className="file-menu-section-label">On this device</p>
            <button role="menuitem" onClick={saveProject}>Download editable KnitPlot file</button>
            <button role="menuitem" onClick={() => inputRef.current?.click()}>Open KnitPlot file</button>
            {accountsEnabled ? <>
              <span className="file-menu-divider" />
              <p className="file-menu-section-label">My Charts</p>
              {signedIn ? <>
                {cloudId ? (
                  <p className={`file-menu-cloud-status ${cloudSaveState}`} role="status" title={cloudSaveMessage}>
                    {cloudSaveState === "saving" ? "Saving changes…" : cloudSaveState === "error" ? "Save failed" : "Saved · changes save automatically"}
                  </p>
                ) : (
                  <button role="menuitem" onClick={() => void onSaveToCloud()} disabled={cloudSaveState === "saving"}>
                    {cloudSaveState === "saving" ? "Saving…" : cloudSaveState === "error" ? "Try saving to My Charts again" : "Save to My Charts"}
                  </button>
                )}
                <Link role="menuitem" href="/my-charts">View My Charts</Link>
              </> : <Link role="menuitem" href="/sign-in">Sign in to use My Charts</Link>}
            </> : null}
            <span className="file-menu-divider" />
            <p className="file-menu-section-label">Export</p>
            <button role="menuitem" onClick={downloadChart}>Download chart image</button>
            <button role="menuitem" onClick={downloadPreview}>Download knitted preview</button>
            {message ? <p className="file-menu-message" role="status">{message}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
