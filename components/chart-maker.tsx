"use client";

import { SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { AiChartGenerator } from "@/components/ai-chart-generator";
import { ChartGrid } from "@/components/chart-grid";
import { ExportTools } from "@/components/export-tools";
import { ImageImporter } from "@/components/image-importer";
import { InstructionsView } from "@/components/instructions-view";
import { KnitPreview } from "@/components/knit-preview";
import { defaultKnitProgress, KnitMode, KnitProgress } from "@/components/knit-mode";
import {
  CellSelection,
  ChartDocument,
  cloneDocument,
  defaultDocument,
  finishedSize,
  floodFill,
  resizeCellsCentered,
  scaleCells,
  Tool,
} from "@/lib/chart";

const STORAGE_KEY = "colorwork-chart-v1";
const INITIAL_TAB_ID = "chart-initial";
const MAX_CHART_TABS = 8;
const colorDefaults = ["#d6a84b", "#6b7da8", "#884d67", "#5f795e", "#29282d"];

type ChartTab = { id: string; document: ChartDocument; knitProgress: KnitProgress };
type TabHistory = { past: ChartDocument[]; future: ChartDocument[] };
type SelectionClipboard = { tabId: string; cells: string[][] };
type WorkspaceSave = {
  format: "knitplot-workspace";
  version: 1 | 2 | 3;
  activeTabId: string;
  tabs: ChartTab[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ChartMaker() {
  const [tabs, setTabs] = useState<ChartTab[]>([{ id: INITIAL_TAB_ID, document: cloneDocument(defaultDocument), knitProgress: { ...defaultKnitProgress } }]);
  const [activeTabId, setActiveTabId] = useState(INITIAL_TAB_ID);
  const document = tabs.find((tab) => tab.id === activeTabId)?.document ?? tabs[0].document;
  const [tool, setTool] = useState<Tool>("pencil");
  const [selectedColor, setSelectedColor] = useState(defaultDocument.palette[1].id);
  const [histories, setHistories] = useState<Record<string, TabHistory>>({
    [INITIAL_TAB_ID]: { past: [], future: [] },
  });
  const [repeatX, setRepeatX] = useState(1);
  const [repeatY, setRepeatY] = useState(1);
  const [repeatStyle, setRepeatStyle] = useState<"normal" | "mirrored">("normal");
  const [previewDocument, setPreviewDocument] = useState<ChartDocument>(() => cloneDocument(defaultDocument));
  const [previewRepeatX, setPreviewRepeatX] = useState(1);
  const [previewRepeatY, setPreviewRepeatY] = useState(1);
  const [previewRepeatStyle, setPreviewRepeatStyle] = useState<"normal" | "mirrored">("normal");
  const [chartZoom, setChartZoom] = useState(100);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null);
  const [knitModeOpen, setKnitModeOpen] = useState(false);
  const [dimensionDraft, setDimensionDraft] = useState({ width: String(defaultDocument.width), height: String(defaultDocument.height) });
  const [gaugeDraft, setGaugeDraft] = useState({
    stitches: String(defaultDocument.gaugeStitches),
    rows: String(defaultDocument.gaugeRows),
    measure: String(defaultDocument.gaugeMeasure),
  });
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const history = histories[activeTabId] ?? { past: [], future: [] };
  const past = history.past;
  const future = history.future;

  function setDocument(update: SetStateAction<ChartDocument>) {
    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      const nextDocument = typeof update === "function"
        ? (update as (current: ChartDocument) => ChartDocument)(tab.document)
        : update;
      return { ...tab, document: nextDocument };
    }));
  }

  function setHistoryPart(key: "past" | "future", update: SetStateAction<ChartDocument[]>) {
    setHistories((current) => {
      const tabHistory = current[activeTabId] ?? { past: [], future: [] };
      const items = tabHistory[key];
      const nextItems = typeof update === "function"
        ? (update as (current: ChartDocument[]) => ChartDocument[])(items)
        : update;
      return { ...current, [activeTabId]: { ...tabHistory, [key]: nextItems } };
    });
  }

  function clampActiveKnitProgress(width: number, height: number) {
    setTabs((current) => current.map((tab) => tab.id === activeTabId ? {
      ...tab,
      knitProgress: {
        ...tab.knitProgress,
        row: clamp(tab.knitProgress.row, 1, height),
        stitch: clamp(tab.knitProgress.stitch, 0, width),
      },
    } : tab));
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChartDocument | WorkspaceSave;
        if ("format" in parsed && parsed.format === "knitplot-workspace" && Array.isArray(parsed.tabs) && parsed.tabs.length) {
          const savedTabs = parsed.tabs.slice(0, MAX_CHART_TABS).map((tab) => {
            const savedProgress = tab.knitProgress ?? defaultKnitProgress;
            const savedDocument = cloneDocument(tab.document);
            return {
              id: tab.id,
              document: savedDocument,
              knitProgress: {
                ...defaultKnitProgress,
                ...savedProgress,
                row: clamp(savedProgress.row, 1, savedDocument.height),
                stitch: clamp(savedProgress.stitch, 0, savedDocument.width),
              },
            };
          });
          const savedActiveId = savedTabs.some((tab) => tab.id === parsed.activeTabId) ? parsed.activeTabId : savedTabs[0].id;
          const savedActiveDocument = savedTabs.find((tab) => tab.id === savedActiveId)!.document;
          setTabs(savedTabs);
          setActiveTabId(savedActiveId);
          setHistories(Object.fromEntries(savedTabs.map((tab) => [tab.id, { past: [], future: [] }])));
          setSelectedColor(savedActiveDocument.palette[1]?.id ?? savedActiveDocument.palette[0].id);
          setPreviewDocument(cloneDocument(savedActiveDocument));
        } else {
          const savedDocument = cloneDocument(parsed as ChartDocument);
          setTabs([{ id: INITIAL_TAB_ID, document: savedDocument, knitProgress: { ...defaultKnitProgress } }]);
          setPreviewDocument(cloneDocument(savedDocument));
        }
      }
    } catch {
      // A malformed browser save should never stop the editor from opening.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const workspace: WorkspaceSave = { format: "knitplot-workspace", version: 3, activeTabId, tabs };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      } catch {
        // Private browsing and full storage quotas should not interrupt editing.
      }
    }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tabs, activeTabId, loaded]);

  useEffect(() => {
    setDimensionDraft({ width: String(document.width), height: String(document.height) });
  }, [document.width, document.height]);

  useEffect(() => {
    setGaugeDraft({
      stitches: String(document.gaugeStitches),
      rows: String(document.gaugeRows),
      measure: String(document.gaugeMeasure),
    });
  }, [document.gaugeStitches, document.gaugeRows, document.gaugeMeasure]);

  const size = useMemo(() => finishedSize(document), [document]);

  function rememberCurrent() {
    setHistoryPart("past", (items) => [...items.slice(-39), cloneDocument(document)]);
    setHistoryPart("future", []);
  }

  function commit(update: (current: ChartDocument) => ChartDocument) {
    rememberCurrent();
    setDocument((current) => update(current));
  }

  function undo() {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setHistoryPart("future", (items) => [cloneDocument(document), ...items]);
    setHistoryPart("past", (items) => items.slice(0, -1));
    setDocument(cloneDocument(previous));
  }

  function redo() {
    if (!future.length) return;
    const next = future[0];
    setHistoryPart("past", (items) => [...items, cloneDocument(document)]);
    setHistoryPart("future", (items) => items.slice(1));
    setDocument(cloneDocument(next));
  }

  function paint(row: number, column: number, shouldFill: boolean) {
    const colorId = tool === "eraser" ? document.palette[0].id : selectedColor;
    setDocument((current) => {
      if (shouldFill) return { ...current, cells: floodFill(current.cells, row, column, colorId) };
      const cells = current.cells.map((currentRow) => [...currentRow]);
      const targets = new Set([`${row}:${column}`]);
      if (current.guides.symmetry === "horizontal" || current.guides.symmetry === "both") {
        targets.add(`${row}:${current.width - column - 1}`);
      }
      if (current.guides.symmetry === "vertical" || current.guides.symmetry === "both") {
        targets.add(`${current.height - row - 1}:${column}`);
      }
      if (current.guides.symmetry === "both") {
        targets.add(`${current.height - row - 1}:${current.width - column - 1}`);
      }
      let changed = false;
      for (const target of targets) {
        const [targetRow, targetColumn] = target.split(":").map(Number);
        if (cells[targetRow][targetColumn] !== colorId) {
          cells[targetRow][targetColumn] = colorId;
          changed = true;
        }
      }
      if (!changed) return current;
      return { ...current, cells };
    });
  }

  function applyGaugeDraft(field: "stitches" | "rows" | "measure") {
    const fallback = field === "stitches" ? document.gaugeStitches : field === "rows" ? document.gaugeRows : document.gaugeMeasure;
    const parsed = gaugeDraft[field].trim() === "" ? Number.NaN : Number(gaugeDraft[field]);
    const next = Number.isFinite(parsed) ? clamp(parsed, 1, 100) : fallback;
    const documentField = field === "stitches" ? "gaugeStitches" : field === "rows" ? "gaugeRows" : "gaugeMeasure";
    setDocument((current) => ({ ...current, [documentField]: next }));
    setGaugeDraft((current) => ({ ...current, [field]: String(next) }));
  }

  function fillSelection() {
    if (!selection) return;
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    const startColumn = Math.min(selection.startColumn, selection.endColumn);
    const endColumn = Math.max(selection.startColumn, selection.endColumn);
    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) cells[row][column] = selectedColor;
      }
      return { ...current, cells };
    });
    setSelection(null);
  }

  function selectionBounds() {
    if (!selection) return null;
    return {
      startRow: Math.min(selection.startRow, selection.endRow),
      endRow: Math.max(selection.startRow, selection.endRow),
      startColumn: Math.min(selection.startColumn, selection.endColumn),
      endColumn: Math.max(selection.startColumn, selection.endColumn),
    };
  }

  function copySelection() {
    const bounds = selectionBounds();
    if (!bounds) return;
    setSelectionClipboard({
      tabId: activeTabId,
      cells: document.cells
        .slice(bounds.startRow, bounds.endRow + 1)
        .map((row) => row.slice(bounds.startColumn, bounds.endColumn + 1)),
    });
  }

  function cutSelection() {
    const bounds = selectionBounds();
    if (!bounds) return;
    copySelection();
    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          cells[row][column] = current.palette[0].id;
        }
      }
      return { ...current, cells };
    });
  }

  function pasteSelection() {
    if (!selectionClipboard || selectionClipboard.tabId !== activeTabId) return;
    const bounds = selectionBounds();
    const startRow = bounds?.startRow ?? 0;
    const startColumn = bounds?.startColumn ?? 0;
    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      selectionClipboard.cells.forEach((clipboardRow, rowOffset) => {
        clipboardRow.forEach((colorId, columnOffset) => {
          if (cells[startRow + rowOffset]?.[startColumn + columnOffset] !== undefined) {
            cells[startRow + rowOffset][startColumn + columnOffset] = colorId;
          }
        });
      });
      return { ...current, cells };
    });
    const pastedHeight = Math.min(selectionClipboard.cells.length, document.height - startRow);
    const pastedWidth = Math.min(selectionClipboard.cells[0]?.length ?? 0, document.width - startColumn);
    if (pastedHeight && pastedWidth) {
      setSelection({
        startRow,
        startColumn,
        endRow: startRow + pastedHeight - 1,
        endColumn: startColumn + pastedWidth - 1,
      });
    }
  }

  function moveSelection(rowAmount: number, columnAmount: number) {
    const bounds = selectionBounds();
    if (!bounds) return;
    const nextStartRow = bounds.startRow + rowAmount;
    const nextEndRow = bounds.endRow + rowAmount;
    const nextStartColumn = bounds.startColumn + columnAmount;
    const nextEndColumn = bounds.endColumn + columnAmount;
    if (nextStartRow < 0 || nextEndRow >= document.height || nextStartColumn < 0 || nextEndColumn >= document.width) return;
    commit((current) => {
      const block = current.cells
        .slice(bounds.startRow, bounds.endRow + 1)
        .map((row) => row.slice(bounds.startColumn, bounds.endColumn + 1));
      const cells = current.cells.map((row) => [...row]);
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) cells[row][column] = current.palette[0].id;
      }
      block.forEach((blockRow, rowOffset) => blockRow.forEach((colorId, columnOffset) => {
        cells[nextStartRow + rowOffset][nextStartColumn + columnOffset] = colorId;
      }));
      return { ...current, cells };
    });
    setSelection({ startRow: nextStartRow, endRow: nextEndRow, startColumn: nextStartColumn, endColumn: nextEndColumn });
  }

  function flipChart(direction: "horizontal" | "vertical") {
    commit((current) => ({
      ...current,
      cells: direction === "horizontal"
        ? current.cells.map((row) => [...row].reverse())
        : [...current.cells].reverse().map((row) => [...row]),
    }));
    setSelection(null);
  }

  function rotateChartClockwise() {
    commit((current) => ({
      ...current,
      width: current.height,
      height: current.width,
      guides: {
        ...current.guides,
        repeatWidth: Math.min(current.height, current.guides.repeatHeight),
        repeatHeight: Math.min(current.width, current.guides.repeatWidth),
      },
      cells: Array.from({ length: current.width }, (_, row) =>
        Array.from({ length: current.height }, (_, column) =>
          current.cells[current.height - 1 - column][row],
        ),
      ),
    }));
    clampActiveKnitProgress(document.height, document.width);
    setSelection(null);
  }

  function refreshPreview() {
    setPreviewDocument(cloneDocument(document));
    setPreviewRepeatX(repeatX);
    setPreviewRepeatY(repeatY);
    setPreviewRepeatStyle(repeatStyle);
  }

  const draftWidth = clamp(Math.round(Number(dimensionDraft.width) || 0), 1, 100);
  const draftHeight = clamp(Math.round(Number(dimensionDraft.height) || 0), 1, 100);
  const dimensionsChanged = draftWidth !== document.width || draftHeight !== document.height;
  const dimensionsValid = Number(dimensionDraft.width) >= 1 && Number(dimensionDraft.height) >= 1;

  function applyResize(mode: "canvas" | "scale") {
    if (!dimensionsValid || !dimensionsChanged) return;
    commit((current) => ({
      ...current,
      width: draftWidth,
      height: draftHeight,
      cells: mode === "scale"
        ? scaleCells(current.cells, draftWidth, draftHeight)
        : resizeCellsCentered(current.cells, draftWidth, draftHeight, current.palette[0].id),
      guides: {
        ...current.guides,
        repeatWidth: Math.min(current.guides.repeatWidth, draftWidth),
        repeatHeight: Math.min(current.guides.repeatHeight, draftHeight),
      },
    }));
    clampActiveKnitProgress(draftWidth, draftHeight);
    setSelection(null);
    setResizeDialogOpen(false);
  }

  function changePaletteColor(id: string, hex: string) {
    commit((current) => ({
      ...current,
      palette: current.palette.map((color) => (color.id === id ? { ...color, hex } : color)),
    }));
  }

  function addColor() {
    if (document.palette.length >= 8) return;
    const id = `color-${Date.now()}`;
    const hex = colorDefaults[(document.palette.length - 3) % colorDefaults.length];
    commit((current) => ({ ...current, palette: [...current.palette, { id, hex }] }));
    setSelectedColor(id);
  }

  function removeColor(id: string) {
    if (document.palette.length <= 2 || id === document.palette[0].id) return;
    const backgroundId = document.palette[0].id;
    commit((current) => ({
      ...current,
      palette: current.palette.filter((color) => color.id !== id),
      cells: current.cells.map((row) => row.map((cell) => (cell === id ? backgroundId : cell))),
    }));
    if (selectedColor === id) setSelectedColor(backgroundId);
  }

  function clearChart() {
    commit((current) => ({
      ...current,
      cells: current.cells.map((row) => row.map(() => current.palette[0].id)),
    }));
  }

  function importImage(palette: ChartDocument["palette"], cells: string[][]) {
    const width = cells[0]?.length ?? document.width;
    const height = cells.length;
    commit((current) => ({
      ...current,
      width,
      height,
      palette,
      cells,
      guides: {
        ...current.guides,
        repeatWidth: Math.min(current.guides.repeatWidth, width),
        repeatHeight: Math.min(current.guides.repeatHeight, height),
      },
    }));
    clampActiveKnitProgress(width, height);
    setSelectedColor(palette[1]?.id ?? palette[0].id);
    setTool("pencil");
    setSelection(null);
  }

  function openProject(nextDocument: ChartDocument) {
    commit(() => cloneDocument(nextDocument));
    setSelectedColor(nextDocument.palette[1]?.id ?? nextDocument.palette[0].id);
    setTool("pencil");
    setChartZoom(100);
    setSelection(null);
    clampActiveKnitProgress(nextDocument.width, nextDocument.height);
  }

  function prepareTabView(nextDocument: ChartDocument) {
    setSelectedColor(nextDocument.palette[1]?.id ?? nextDocument.palette[0].id);
    setTool("pencil");
    setSelection(null);
    setChartZoom(100);
    setRepeatX(1);
    setRepeatY(1);
    setRepeatStyle("normal");
    setPreviewDocument(cloneDocument(nextDocument));
    setPreviewRepeatX(1);
    setPreviewRepeatY(1);
    setPreviewRepeatStyle("normal");
    setResizeDialogOpen(false);
    setSelectionClipboard(null);
  }

  function switchTab(id: string) {
    if (id === activeTabId) return;
    const nextTab = tabs.find((tab) => tab.id === id);
    if (!nextTab) return;
    setActiveTabId(id);
    prepareTabView(nextTab.document);
  }

  function addTab() {
    if (tabs.length >= MAX_CHART_TABS) return;
    const id = `chart-${crypto.randomUUID()}`;
    const nextDocument = cloneDocument(defaultDocument);
    setTabs((current) => [...current, { id, document: nextDocument, knitProgress: { ...defaultKnitProgress } }]);
    setHistories((current) => ({ ...current, [id]: { past: [], future: [] } }));
    setActiveTabId(id);
    prepareTabView(nextDocument);
  }

  function duplicateTab() {
    if (tabs.length >= MAX_CHART_TABS) return;
    const id = `chart-${crypto.randomUUID()}`;
    const nextDocument = cloneDocument({ ...document, name: `${document.name || "Untitled chart"} copy` });
    setTabs((current) => [...current, { id, document: nextDocument, knitProgress: { ...defaultKnitProgress } }]);
    setHistories((current) => ({ ...current, [id]: { past: [], future: [] } }));
    setActiveTabId(id);
    prepareTabView(nextDocument);
  }

  function updateKnitProgress(progress: KnitProgress) {
    setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, knitProgress: progress } : tab));
  }

  function updateInstructionSettings(instructions: ChartDocument["instructions"]) {
    const readingDirectionChanged = instructions.technique !== document.instructions.technique || instructions.construction !== document.instructions.construction;
    setDocument((current) => ({ ...current, instructions }));
    if (readingDirectionChanged) {
      setTabs((current) => current.map((tab) => tab.id === activeTabId
        ? { ...tab, knitProgress: { ...tab.knitProgress, stitch: 0 } }
        : tab));
    }
  }

  function closeTab(id: string) {
    setClosingTabId(id);
  }

  function confirmCloseTab() {
    if (!closingTabId) return;
    const id = closingTabId;
    const closingIndex = tabs.findIndex((tab) => tab.id === id);
    const remainingTabs = tabs.filter((tab) => tab.id !== id);
    if (closingIndex < 0 || !remainingTabs.length) {
      setClosingTabId(null);
      return;
    }
    setTabs(remainingTabs);
    setHistories((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (id === activeTabId) {
      const nextTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)];
      setActiveTabId(nextTab.id);
      prepareTabView(nextTab.document);
    }
    setClosingTabId(null);
  }

  const previewOutdated = JSON.stringify(document) !== JSON.stringify(previewDocument) || repeatX !== previewRepeatX || repeatY !== previewRepeatY || repeatStyle !== previewRepeatStyle;
  const knitProgress = tabs.find((tab) => tab.id === activeTabId)?.knitProgress ?? defaultKnitProgress;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="project-bar">
          <div className="brand-lockup" aria-label="KnitPlot">
            <span className="brand-mark" aria-hidden="true" />
            <span>KnitPlot</span>
          </div>
          <span className="brand-divider" aria-hidden="true" />
          <div className="project-identity">
            <label htmlFor="project-name">Working file</label>
            <input
              id="project-name"
              className="project-name"
              value={document.name}
              aria-label="Chart name"
              onChange={(event) => setDocument((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
        </div>
        <div className="topbar-actions">
          <button className="primary-button knit-mode-button" onClick={() => setKnitModeOpen(true)}>Knit mode</button>
          <AiChartGenerator document={document} onImport={importImage} />
          <ImageImporter document={document} onImport={importImage} />
          <InstructionsView document={document} onSettingsChange={updateInstructionSettings} />
          <ExportTools document={document} previewCanvasRef={previewCanvasRef} onOpenProject={openProject} />
        </div>
      </header>

      <div className="chart-tabs-bar">
        <div className="chart-tabs" role="tablist" aria-label="Open charts">
          {tabs.map((tab) => (
            <div className={`chart-tab ${tab.id === activeTabId ? "active" : ""}`} key={tab.id}>
              <button
                className="chart-tab-select"
                role="tab"
                aria-selected={tab.id === activeTabId}
                onClick={() => switchTab(tab.id)}
              >
                {tab.document.name.trim() || "Untitled chart"}
              </button>
              <button
                className="chart-tab-close"
                aria-label={`Close ${tab.document.name.trim() || "Untitled chart"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                disabled={tabs.length === 1}
              >×</button>
            </div>
          ))}
        </div>
        <div className="chart-tab-actions">
          <button className="new-chart-tab" onClick={duplicateTab} disabled={tabs.length >= MAX_CHART_TABS}>Duplicate</button>
          <button className="new-chart-tab" onClick={addTab} disabled={tabs.length >= MAX_CHART_TABS}>+ New chart</button>
        </div>
      </div>

      <div className="workspace">
        <aside className="sidebar panel">
          <details className="settings-group" open>
            <summary>Colours <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="compact-section-action"><button className="text-button" onClick={addColor} disabled={document.palette.length >= 8}>+ Add colour</button></div>
              <div className="palette-list">
                {document.palette.map((color, index) => (
                  <div className={`palette-row ${selectedColor === color.id ? "selected" : ""}`} key={color.id}>
                    <button className="swatch-button" aria-label={`Use colour ${index + 1}`} onClick={() => setSelectedColor(color.id)}>
                      <span className="swatch" style={{ background: color.hex }} />
                      <span className="palette-name">
                        <span>{index === 0 ? "Background" : `Colour ${index + 1}`}</span>
                        <span className="palette-hex">{color.hex.toUpperCase()}</span>
                      </span>
                    </button>
                    <input type="color" value={color.hex} aria-label={`Change colour ${index + 1}`} onChange={(event) => changePaletteColor(color.id, event.target.value)} />
                    {index > 0 && document.palette.length > 2 ? <button className="remove-button" aria-label={`Remove colour ${index + 1}`} onClick={() => removeColor(color.id)}>×</button> : null}
                  </div>
                ))}
              </div>
            </div>
          </details>

          <details className="settings-group" open>
            <summary>Chart size <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="two-fields">
                <label>Stitches<input type="number" min="1" max="100" value={dimensionDraft.width} onChange={(event) => setDimensionDraft((current) => ({ ...current, width: event.target.value }))} /></label>
                <label>Rows<input type="number" min="1" max="100" value={dimensionDraft.height} onChange={(event) => setDimensionDraft((current) => ({ ...current, height: event.target.value }))} /></label>
              </div>
              <button className="resize-chart-button" onClick={() => setResizeDialogOpen(true)} disabled={!dimensionsValid || !dimensionsChanged}>Resize chart</button>
            </div>
          </details>

          <details className="settings-group gauge-settings" open>
            <summary>Gauge <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="two-fields">
                <label>Stitches<input type="number" min="1" value={gaugeDraft.stitches} onChange={(event) => setGaugeDraft((current) => ({ ...current, stitches: event.target.value }))} onBlur={() => applyGaugeDraft("stitches")} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                <label>Rows<input type="number" min="1" value={gaugeDraft.rows} onChange={(event) => setGaugeDraft((current) => ({ ...current, rows: event.target.value }))} onBlur={() => applyGaugeDraft("rows")} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
              </div>
              <div className="measure-field">
                <span>over</span>
                <input aria-label="Gauge measurement" type="number" min="1" value={gaugeDraft.measure} onChange={(event) => setGaugeDraft((current) => ({ ...current, measure: event.target.value }))} onBlur={() => applyGaugeDraft("measure")} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                <select aria-label="Gauge unit" value={document.gaugeUnit} onChange={(event) => setDocument((current) => ({ ...current, gaugeUnit: event.target.value as "cm" | "in" }))}>
                  <option value="cm">cm</option><option value="in">in</option>
                </select>
              </div>
              <p className="measurement">Finished size: {size.width.toFixed(1)} × {size.height.toFixed(1)} {document.gaugeUnit}</p>
            </div>
          </details>

          <details className="settings-group">
            <summary>Pattern guides <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <label className="stacked-field">Live symmetry
                <select value={document.guides.symmetry} onChange={(event) => setDocument((current) => ({ ...current, guides: { ...current.guides, symmetry: event.target.value as ChartDocument["guides"]["symmetry"] } }))}>
                  <option value="none">Off</option>
                  <option value="horizontal">Mirror left and right</option>
                  <option value="vertical">Mirror top and bottom</option>
                  <option value="both">Mirror both ways</option>
                </select>
              </label>
              <p className="setting-help">Symmetry affects drawing and erasing. Blue dashed lines mark the active mirror axes.</p>
            </div>
          </details>
        </aside>

        <section className="editor panel">
          <div className="panel-heading editor-heading">
            <h1 className="visually-hidden">Chart editor</h1>
            <div className="editor-actions">
              <div className="tool-group" aria-label="Drawing tools">
                <button className={tool === "pencil" ? "active" : ""} onClick={() => setTool("pencil")}>Draw</button>
                <button className={tool === "fill" ? "active" : ""} onClick={() => setTool("fill")}>Fill</button>
                <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}>Erase</button>
                <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}>Select</button>
                {selection ? <button className="selection-fill-button" onClick={fillSelection}>Fill selection</button> : null}
                {selection ? <button onClick={copySelection}>Copy</button> : null}
                {selection ? <button onClick={cutSelection}>Cut</button> : null}
                {selectionClipboard?.tabId === activeTabId ? <button onClick={pasteSelection} title="Paste at the top-left corner of the current selection">Paste</button> : null}
                {selection ? <span className="selection-move-controls" aria-label="Move selection">
                  <button aria-label="Move selection left" onClick={() => moveSelection(0, -1)}>←</button>
                  <button aria-label="Move selection up" onClick={() => moveSelection(-1, 0)}>↑</button>
                  <button aria-label="Move selection down" onClick={() => moveSelection(1, 0)}>↓</button>
                  <button aria-label="Move selection right" onClick={() => moveSelection(0, 1)}>→</button>
                </span> : null}
                {selection ? <button onClick={() => setSelection(null)}>Deselect</button> : null}
                <button onClick={clearChart}>Clear</button>
              </div>
              <span className="toolbar-divider" aria-hidden="true" />
              <div className="transform-controls" aria-label="Transform chart">
                <button aria-label="Mirror chart left to right" onClick={() => flipChart("horizontal")} title="Mirror chart left to right">↔</button>
                <button aria-label="Flip chart upside down" onClick={() => flipChart("vertical")} title="Flip chart upside down">↕</button>
                <button className="rotate-chart-button" aria-label="Rotate chart 90 degrees clockwise" onClick={rotateChartClockwise} title="Rotate chart 90° clockwise">90°</button>
              </div>
              <span className="toolbar-divider" aria-hidden="true" />
              <div className="undo-controls" aria-label="Edit history">
                <button aria-label="Undo" onClick={undo} disabled={!past.length}>↺</button>
                <button aria-label="Redo" onClick={redo} disabled={!future.length}>↻</button>
              </div>
              <div className="zoom-controls" aria-label="Chart zoom">
                <button aria-label="Zoom out" onClick={() => setChartZoom((value) => Math.max(100, value - 50))} disabled={chartZoom === 100}>−</button>
                <span>{chartZoom}%</span>
                <button aria-label="Zoom in" onClick={() => setChartZoom((value) => Math.min(400, value + 50))} disabled={chartZoom === 400}>+</button>
              </div>
            </div>
          </div>
          <ChartGrid document={document} tool={tool} selectedColor={selectedColor} zoom={chartZoom} selection={selection} onSelectionChange={setSelection} onStrokeStart={rememberCurrent} onPaint={paint} />
        </section>

        <details className="preview panel" open>
          <summary className="panel-heading collapsible-heading">
            <div className="preview-heading-copy"><h1>Knitted up</h1><span>approximate fabric at your gauge</span></div>
            <span className="collapse-label">Show / hide <span aria-hidden="true">⌄</span></span>
          </summary>
          <div className="preview-content">
            <div className="repeat-controls">
              <span>Repeats</span>
              <label className="repeat-style">Style<select value={repeatStyle} onChange={(event) => setRepeatStyle(event.target.value as "normal" | "mirrored")}><option value="normal">Normal</option><option value="mirrored">Mirrored</option></select></label>
              <label>Across<select value={repeatX} onChange={(event) => setRepeatX(Number(event.target.value))}><option>1</option><option>2</option><option>3</option></select></label>
              <label>Down<select value={repeatY} onChange={(event) => setRepeatY(Number(event.target.value))}><option>1</option><option>2</option><option>3</option></select></label>
              <button className="primary-button refresh-preview-button" onClick={refreshPreview}>Refresh preview</button>
            </div>
            {previewOutdated ? <p className="preview-stale-note" role="status">Preview needs a refresh.</p> : null}
            <KnitPreview document={previewDocument} repeatX={previewRepeatX} repeatY={previewRepeatY} repeatStyle={previewRepeatStyle} canvasRef={previewCanvasRef} />
            <p className="preview-note">This is an approximate fabric view using your gauge and colours.</p>
          </div>
        </details>
      </div>

      {resizeDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog resize-dialog" role="dialog" aria-modal="true" aria-labelledby="resize-dialog-title">
            <div className="import-dialog-heading">
              <div><p className="eyebrow">Resize chart</p><h1 id="resize-dialog-title">How should the design fit?</h1></div>
              <button className="close-dialog" aria-label="Close resize dialog" onClick={() => setResizeDialogOpen(false)}>×</button>
            </div>
            <p className="import-note">Change from {document.width} × {document.height} to {draftWidth} × {draftHeight}.</p>
            <div className="resize-options">
              <button className="resize-choice recommended" onClick={() => applyResize("canvas")}>
                <strong>Add or crop space</strong>
                <span>Keeps every stitch the same size and centres the design. New space uses the background colour.</span>
                <small>Recommended</small>
              </button>
              <button className="resize-choice" onClick={() => applyResize("scale")}>
                <strong>Scale design to fit</strong>
                <span>Stretches or shrinks the whole design to fill the new chart size.</span>
              </button>
            </div>
            <div className="import-actions"><button onClick={() => setResizeDialogOpen(false)}>Cancel</button></div>
          </section>
        </div>
      ) : null}

      {knitModeOpen ? <KnitMode document={document} progress={knitProgress} onProgressChange={updateKnitProgress} onSettingsChange={updateInstructionSettings} onClose={() => setKnitModeOpen(false)} /> : null}

      {closingTabId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog close-tab-dialog" role="dialog" aria-modal="true" aria-labelledby="close-tab-title">
            <div className="import-dialog-heading">
              <div><p className="eyebrow">Close chart</p><h1 id="close-tab-title">Remove this chart tab?</h1></div>
              <button className="close-dialog" aria-label="Cancel closing chart" onClick={() => setClosingTabId(null)}>×</button>
            </div>
            <p className="import-note">
              “{tabs.find((tab) => tab.id === closingTabId)?.document.name || "Untitled chart"}” will be removed from this browser workspace. Save an editable project first if you want to keep a separate copy.
            </p>
            <div className="import-actions">
              <button onClick={() => setClosingTabId(null)}>Cancel</button>
              <button className="danger-button" onClick={confirmCloseTab}>Close chart</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
