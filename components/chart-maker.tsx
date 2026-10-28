"use client";

import Link from "next/link";
import { AccountAvatar } from "@/components/account-avatar";
import { SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { AiChartGenerator } from "@/components/ai-chart-generator";
import { ChartGrid } from "@/components/chart-grid";
import { ExportTools } from "@/components/export-tools";
import { ImageImporter } from "@/components/image-importer";
import { InstructionsView } from "@/components/instructions-view";
import { ConnectedKnitPreview } from "@/components/connected-knit-preview";
import { defaultKnitProgress, KnitMode, KnitProgress } from "@/components/knit-mode";
import { OnboardingTour } from "@/components/onboarding-tour";
import { PatternChartImporter } from "@/components/pattern-chart-importer";
import {
  CellSelection,
  ChartDocument,
  cloneDocument,
  copyStitchCellColors,
  contrastTextColor,
  createStitchActions,
  defaultDocument,
  finishedSize,
  flipGrid,
  paintYarnCells,
  recolourStitchType,
  yarnFillTargets,
  paintStitchCells,
  stitchFillTargets,
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  resizeCellsCentered,
  resizeStitchActionsCentered,
  rotateGridClockwise,
  scaleCells,
  scaleStitchActions,
  stitchActionAt,
  stitchActionOptions,
  stitchDisplayColor,
  stitchPaletteFromActions,
  StitchAction,
  StitchPaletteAction,
  Tool,
} from "@/lib/chart";
import type { Viewer } from "@/lib/auth";
import { tutorialExampleDocument, type TutorialExample } from "@/lib/tutorial-examples";

const STORAGE_KEY = "colorwork-chart-v1";
const INITIAL_TAB_ID = "chart-initial";
const MAX_CHART_TABS = 8;
const colorDefaults = ["#d6a84b", "#6b7da8", "#884d67", "#5f795e", "#29282d"];

type RepeatStyle = "normal" | "mirrored";
type PreviewSettings = {
  repeatX: number;
  repeatY: number;
  repeatStyle: RepeatStyle;
  renderedRepeatX: number;
  renderedRepeatY: number;
  renderedRepeatStyle: RepeatStyle;
};
type ChartTab = { id: string; cloudId?: string; document: ChartDocument; knitProgress: KnitProgress; preview: PreviewSettings };
type TabHistory = { past: ChartDocument[]; future: ChartDocument[] };
type SelectionClipboard = { tabId: string; cells: string[][]; stitchActions: StitchAction[][]; stitchCellColors: (string | null)[][] };
type WorkspaceSave = {
  format: "knitplot-workspace";
  version: 1 | 2 | 3 | 4;
  activeTabId: string;
  tabs: ChartTab[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizedRepeat(value: number | undefined, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 1, 3) : fallback;
}

function createPreviewSettings(saved?: Partial<PreviewSettings>): PreviewSettings {
  const repeatX = normalizedRepeat(saved?.repeatX);
  const repeatY = normalizedRepeat(saved?.repeatY);
  const repeatStyle: RepeatStyle = saved?.repeatStyle === "mirrored" ? "mirrored" : "normal";
  return {
    repeatX,
    repeatY,
    repeatStyle,
    renderedRepeatX: normalizedRepeat(saved?.renderedRepeatX, repeatX),
    renderedRepeatY: normalizedRepeat(saved?.renderedRepeatY, repeatY),
    renderedRepeatStyle: saved?.renderedRepeatStyle === "mirrored" ? "mirrored" : repeatStyle,
  };
}

type ChartMakerProps = {
  viewer: Viewer | null;
  accountsEnabled: boolean;
  aiConnected: boolean;
};

export function ChartMaker({ viewer, accountsEnabled, aiConnected }: ChartMakerProps) {
  const [tabs, setTabs] = useState<ChartTab[]>([{
    id: INITIAL_TAB_ID,
    document: cloneDocument(defaultDocument),
    knitProgress: { ...defaultKnitProgress },
    preview: createPreviewSettings(),
  }]);
  const [activeTabId, setActiveTabId] = useState(INITIAL_TAB_ID);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const document = activeTab.document;
  const [tool, setTool] = useState<Tool>("pencil");
  const [structureAction, setStructureAction] = useState<StitchAction | null>(null);
  const [stitchPickerOpen, setStitchPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(defaultDocument.palette[1].id);
  const [histories, setHistories] = useState<Record<string, TabHistory>>({
    [INITIAL_TAB_ID]: { past: [], future: [] },
  });
  const [previewDocuments, setPreviewDocuments] = useState<Record<string, ChartDocument>>({
    [INITIAL_TAB_ID]: cloneDocument(defaultDocument),
  });
  const preview = activeTab.preview;
  const previewDocument = previewDocuments[activeTabId] ?? document;
  const [chartZoom, setChartZoom] = useState(100);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null);
  const [knitModeOpen, setKnitModeOpen] = useState(false);
  const [patternImporterOpen, setPatternImporterOpen] = useState(false);
  const [dimensionDraft, setDimensionDraft] = useState({ width: String(defaultDocument.width), height: String(defaultDocument.height) });
  const [gaugeDraft, setGaugeDraft] = useState({
    stitches: String(defaultDocument.gaugeStitches),
    rows: String(defaultDocument.gaugeRows),
    measure: String(defaultDocument.gaugeMeasure),
  });
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cloudSaveState, setCloudSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudSaveMessage, setCloudSaveMessage] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function updatePreviewSettings(update: Partial<PreviewSettings>) {
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === activeTabId
      ? { ...tab, preview: { ...tab.preview, ...update } }
      : tab));
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
              cloudId: typeof tab.cloudId === "string" ? tab.cloudId : undefined,
              document: savedDocument,
              preview: createPreviewSettings(tab.preview),
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
          setPreviewDocuments(Object.fromEntries(savedTabs.map((tab) => [tab.id, cloneDocument(tab.document)])));
        } else {
          const savedDocument = cloneDocument(parsed as ChartDocument);
          setTabs([{
            id: INITIAL_TAB_ID,
            document: savedDocument,
            knitProgress: { ...defaultKnitProgress },
            preview: createPreviewSettings(),
          }]);
          setPreviewDocuments({ [INITIAL_TAB_ID]: cloneDocument(savedDocument) });
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
        const workspace: WorkspaceSave = { format: "knitplot-workspace", version: 4, activeTabId, tabs };
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
    if (!loaded) return;
    if (!viewer || !activeTab.cloudId) {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      setCloudSaveState("idle");
      setCloudSaveMessage("");
      return;
    }
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    setCloudSaveState("saving");
    setCloudSaveMessage("Saving to My Charts…");
    cloudSaveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/charts/${encodeURIComponent(activeTab.cloudId!)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: activeTab.document, knitProgress: activeTab.knitProgress, preview: activeTab.preview }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Cloud save failed.");
        setCloudSaveState("saved");
        setCloudSaveMessage("Saved to My Charts");
      } catch (error) {
        setCloudSaveState("error");
        setCloudSaveMessage(error instanceof Error ? error.message : "Cloud save failed.");
      }
    }, 1200);
    return () => {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    };
  }, [activeTab, loaded, viewer]);

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
  const stitchPalette = document.stitchPalette ?? stitchPaletteFromActions(document.stitchActions);

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
    if (structureAction) {
      setDocument((current) => {
        if (shouldFill) {
          return paintStitchCells(current, stitchFillTargets(current, row, column), structureAction);
        }
        const targets = new Set([`${row}:${column}`]);
        if (current.guides.symmetry === "horizontal" || current.guides.symmetry === "both") targets.add(`${row}:${current.width - column - 1}`);
        if (current.guides.symmetry === "vertical" || current.guides.symmetry === "both") targets.add(`${current.height - row - 1}:${column}`);
        if (current.guides.symmetry === "both") targets.add(`${current.height - row - 1}:${current.width - column - 1}`);
        return paintStitchCells(current, [...targets].map(target => target.split(":").map(Number) as [number, number]), structureAction);
      });
      return;
    }
    const colorId = tool === "eraser" ? document.palette[0].id : selectedColor;
    setDocument((current) => {
      if (shouldFill) {
        return paintYarnCells(current, yarnFillTargets(current, row, column), colorId);
      }
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
      return paintYarnCells(current, [...targets].map(target => target.split(":").map(Number) as [number, number]), colorId);
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
      const targets: Array<[number, number]> = [];
      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          targets.push([row, column]);
        }
      }
      return paintYarnCells(current, targets, selectedColor);
    });
    setSelection(null);
  }

  function applyStructureToSelection() {
    const bounds = selectionBounds();
    if (!bounds || !structureAction) return;
    commit((current) => {
      const targets: Array<[number, number]> = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          targets.push([row, column]);
        }
      }
      return paintStitchCells(current, targets, structureAction);
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
      stitchCellColors: copyStitchCellColors(document).slice(bounds.startRow, bounds.endRow + 1).map(row => row.slice(bounds.startColumn, bounds.endColumn + 1)),
      cells: document.cells
        .slice(bounds.startRow, bounds.endRow + 1)
        .map((row) => row.slice(bounds.startColumn, bounds.endColumn + 1)),
      stitchActions: Array.from({ length: bounds.endRow - bounds.startRow + 1 }, (_, rowOffset) =>
        Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_, columnOffset) =>
          stitchActionAt(document, bounds.startRow + rowOffset, bounds.startColumn + columnOffset),
        ),
      ),
    });
  }

  function cutSelection() {
    const bounds = selectionBounds();
    if (!bounds) return;
    copySelection();
    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      const stitchCellColors = copyStitchCellColors(current);
      const stitchActions = (current.stitchActions ?? createStitchActions(current.width, current.height)).map((row) => [...row]);
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          cells[row][column] = current.palette[0].id;
          stitchCellColors[row][column] = null;
          stitchActions[row][column] = "knit";
        }
      }
      return { ...current, cells, stitchCellColors, stitchActions: stitchActions.some((row) => row.some((action) => action !== "knit")) ? stitchActions : undefined };
    });
  }

  function pasteSelection() {
    if (!selectionClipboard || selectionClipboard.tabId !== activeTabId) return;
    const bounds = selectionBounds();
    const startRow = bounds?.startRow ?? 0;
    const startColumn = bounds?.startColumn ?? 0;
    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      const stitchCellColors = copyStitchCellColors(current);
      const stitchActions = (current.stitchActions ?? createStitchActions(current.width, current.height)).map((row) => [...row]);
      selectionClipboard.cells.forEach((clipboardRow, rowOffset) => {
        clipboardRow.forEach((colorId, columnOffset) => {
          if (cells[startRow + rowOffset]?.[startColumn + columnOffset] !== undefined) {
            cells[startRow + rowOffset][startColumn + columnOffset] = colorId;
            stitchCellColors[startRow + rowOffset][startColumn + columnOffset] = selectionClipboard.stitchCellColors[rowOffset]?.[columnOffset] ?? null;
            stitchActions[startRow + rowOffset][startColumn + columnOffset] = selectionClipboard.stitchActions[rowOffset]?.[columnOffset] ?? "knit";
          }
        });
      });
      return { ...current, cells, stitchCellColors, stitchActions: stitchActions.some((row) => row.some((action) => action !== "knit")) ? stitchActions : undefined };
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
      const actionBlock = Array.from({ length: bounds.endRow - bounds.startRow + 1 }, (_, rowOffset) =>
        Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_, columnOffset) =>
          stitchActionAt(current, bounds.startRow + rowOffset, bounds.startColumn + columnOffset),
        ),
      );
      const cells = current.cells.map((row) => [...row]);
      const stitchCellColors = copyStitchCellColors(current);
      const colourBlock = stitchCellColors.slice(bounds.startRow, bounds.endRow + 1).map(row => row.slice(bounds.startColumn, bounds.endColumn + 1));
      const stitchActions = (current.stitchActions ?? createStitchActions(current.width, current.height)).map((row) => [...row]);
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          cells[row][column] = current.palette[0].id;
          stitchCellColors[row][column] = null;
          stitchActions[row][column] = "knit";
        }
      }
      block.forEach((blockRow, rowOffset) => blockRow.forEach((colorId, columnOffset) => {
        cells[nextStartRow + rowOffset][nextStartColumn + columnOffset] = colorId;
        stitchCellColors[nextStartRow + rowOffset][nextStartColumn + columnOffset] = colourBlock[rowOffset][columnOffset];
        stitchActions[nextStartRow + rowOffset][nextStartColumn + columnOffset] = actionBlock[rowOffset][columnOffset];
      }));
      return { ...current, cells, stitchCellColors, stitchActions: stitchActions.some((row) => row.some((action) => action !== "knit")) ? stitchActions : undefined };
    });
    setSelection({ startRow: nextStartRow, endRow: nextEndRow, startColumn: nextStartColumn, endColumn: nextEndColumn });
  }

  function selectionRotationFits() {
    const bounds = selectionBounds();
    if (!bounds) return false;
    const selectionWidth = bounds.endColumn - bounds.startColumn + 1;
    const selectionHeight = bounds.endRow - bounds.startRow + 1;
    return bounds.startRow + selectionWidth <= document.height && bounds.startColumn + selectionHeight <= document.width;
  }

  function transformSelection(transform: "horizontal" | "vertical" | "rotate") {
    const bounds = selectionBounds();
    if (!bounds || (transform === "rotate" && !selectionRotationFits())) return;
    const block = document.cells
      .slice(bounds.startRow, bounds.endRow + 1)
      .map((row) => row.slice(bounds.startColumn, bounds.endColumn + 1));
    const actionBlock = Array.from({ length: bounds.endRow - bounds.startRow + 1 }, (_, rowOffset) =>
      Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_, columnOffset) =>
        stitchActionAt(document, bounds.startRow + rowOffset, bounds.startColumn + columnOffset),
      ),
    );
    const transformedCells = transform === "rotate" ? rotateGridClockwise(block) : flipGrid(block, transform);
    const transformedActions = transform === "rotate" ? rotateGridClockwise(actionBlock) : flipGrid(actionBlock, transform);
    const colourBlock = copyStitchCellColors(document).slice(bounds.startRow, bounds.endRow + 1).map(row => row.slice(bounds.startColumn, bounds.endColumn + 1));
    const transformedColours = transform === "rotate" ? rotateGridClockwise(colourBlock) : flipGrid(colourBlock, transform);

    commit((current) => {
      const cells = current.cells.map((row) => [...row]);
      const stitchCellColors = copyStitchCellColors(current);
      const stitchActions = (current.stitchActions ?? createStitchActions(current.width, current.height)).map((row) => [...row]);
      for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
        for (let column = bounds.startColumn; column <= bounds.endColumn; column += 1) {
          cells[row][column] = current.palette[0].id;
          stitchCellColors[row][column] = null;
          stitchActions[row][column] = "knit";
        }
      }
      transformedCells.forEach((blockRow, rowOffset) => blockRow.forEach((colorId, columnOffset) => {
        cells[bounds.startRow + rowOffset][bounds.startColumn + columnOffset] = colorId;
        stitchCellColors[bounds.startRow + rowOffset][bounds.startColumn + columnOffset] = transformedColours[rowOffset][columnOffset];
        stitchActions[bounds.startRow + rowOffset][bounds.startColumn + columnOffset] = transformedActions[rowOffset][columnOffset];
      }));
      return {
        ...current,
        cells,
        stitchCellColors,
        stitchActions: stitchActions.some((row) => row.some((action) => action !== "knit")) ? stitchActions : undefined,
      };
    });
    setSelection({
      startRow: bounds.startRow,
      startColumn: bounds.startColumn,
      endRow: bounds.startRow + transformedCells.length - 1,
      endColumn: bounds.startColumn + (transformedCells[0]?.length ?? 1) - 1,
    });
  }

  function flipChart(direction: "horizontal" | "vertical") {
    if (selection) {
      transformSelection(direction);
      return;
    }
    commit((current) => ({
      ...current,
      cells: flipGrid(current.cells, direction),
      stitchCellColors: flipGrid(copyStitchCellColors(current), direction),
      stitchActions: current.stitchActions ? flipGrid(current.stitchActions, direction) : undefined,
    }));
    setSelection(null);
  }

  function rotateChartClockwise() {
    if (selection) {
      transformSelection("rotate");
      return;
    }
    if (document.width > MAX_CHART_ROWS || document.height > MAX_CHART_STITCHES) return;
    commit((current) => ({
      ...current,
      width: current.height,
      height: current.width,
      guides: {
        ...current.guides,
        repeatWidth: Math.min(current.height, current.guides.repeatHeight),
        repeatHeight: Math.min(current.width, current.guides.repeatWidth),
      },
      cells: rotateGridClockwise(current.cells),
      stitchCellColors: rotateGridClockwise(copyStitchCellColors(current)),
      stitchActions: current.stitchActions ? rotateGridClockwise(current.stitchActions) : undefined,
    }));
    clampActiveKnitProgress(document.height, document.width);
    setSelection(null);
  }

  function refreshPreview() {
    setPreviewDocuments((current) => ({ ...current, [activeTabId]: cloneDocument(document) }));
    updatePreviewSettings({
      renderedRepeatX: preview.repeatX,
      renderedRepeatY: preview.repeatY,
      renderedRepeatStyle: preview.repeatStyle,
    });
  }

  const draftWidth = clamp(Math.round(Number(dimensionDraft.width) || 0), 1, MAX_CHART_STITCHES);
  const draftHeight = clamp(Math.round(Number(dimensionDraft.height) || 0), 1, MAX_CHART_ROWS);
  const dimensionsChanged = draftWidth !== document.width || draftHeight !== document.height;
  const dimensionsValid =
    Number(dimensionDraft.width) >= 1 && Number(dimensionDraft.width) <= MAX_CHART_STITCHES &&
    Number(dimensionDraft.height) >= 1 && Number(dimensionDraft.height) <= MAX_CHART_ROWS;

  function applyResize(mode: "canvas" | "scale") {
    if (!dimensionsValid || !dimensionsChanged) return;
    if (mode === "scale" && document.stitchActions) return;
    commit((current) => ({
      ...current,
      width: draftWidth,
      height: draftHeight,
      stitchCellColors: mode === "scale"
        ? scaleCells(copyStitchCellColors(current), draftWidth, draftHeight)
        : resizeCellsCentered<string | null>(copyStitchCellColors(current), draftWidth, draftHeight, null),
      cells: mode === "scale"
        ? scaleCells(current.cells, draftWidth, draftHeight)
        : resizeCellsCentered(current.cells, draftWidth, draftHeight, current.palette[0].id),
      stitchActions: mode === "scale"
        ? scaleStitchActions(current.stitchActions, draftWidth, draftHeight)
        : resizeStitchActionsCentered(current.stitchActions, current.width, current.height, draftWidth, draftHeight),
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
    setStructureAction(null);
    setStitchPickerOpen(false);
  }

  function selectStitchAction(action: StitchAction) {
    setStructureAction(action);
    if (tool !== "fill") setTool("pencil");
  }

  function addStitchToPalette(action: StitchPaletteAction) {
    commit((current) => ({
      ...current,
      stitchPalette: current.stitchPalette?.includes(action)
        ? current.stitchPalette
        : [...(current.stitchPalette ?? stitchPaletteFromActions(current.stitchActions)), action],
    }));
    selectStitchAction(action);
    setStitchPickerOpen(false);
  }

  function removeStitchFromPalette(action: StitchPaletteAction) {
    commit((current) => ({
      ...current,
      stitchPalette: (current.stitchPalette ?? stitchPaletteFromActions(current.stitchActions)).filter((item) => item !== action),
    }));
    if (structureAction === action) setStructureAction(null);
  }

  function changeStitchColor(action: StitchPaletteAction, hex: string) {
    commit((current) => recolourStitchType(current, action, hex));
    selectStitchAction(action);
  }

  function resetStitchColor(action: StitchPaletteAction) {
    commit((current) => recolourStitchType(current, action, null));
    selectStitchAction(action);
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
      stitchActions: undefined,
      stitchCellColors: undefined,
      stitchPalette: [],
      stitchColors: {},
      guides: {
        ...current.guides,
        repeatWidth: Math.min(current.guides.repeatWidth, width),
        repeatHeight: Math.min(current.guides.repeatHeight, height),
      },
    }));
    clampActiveKnitProgress(width, height);
    setSelectedColor(palette[1]?.id ?? palette[0].id);
    setTool("pencil");
    setStructureAction(null);
    setStitchPickerOpen(false);
    setSelection(null);
  }

  function importAiChart(palette: ChartDocument["palette"], cells: string[][]) {
    const width = cells[0]?.length ?? document.width;
    const height = cells.length;
    const preservedActions = width === document.width && height === document.height ? document.stitchActions : undefined;
    const preservedCellColors = copyStitchCellColors(document);
    const preservedStitchPalette = width === document.width && height === document.height ? document.stitchPalette : undefined;
    const preservedStitchColors = width === document.width && height === document.height ? document.stitchColors : undefined;
    importImage(palette, cells);
    if (preservedActions) setDocument((current) => ({
      ...current,
      stitchActions: preservedActions.map((row) => [...row]),
      stitchCellColors: preservedCellColors,
      stitchPalette: preservedStitchPalette ? [...preservedStitchPalette] : stitchPaletteFromActions(preservedActions),
      stitchColors: { ...preservedStitchColors },
    }));
  }

  function importPatternChart(
    palette: ChartDocument["palette"],
    cells: string[][],
    stitchActions: StitchAction[][],
    construction: ChartDocument["instructions"]["construction"],
    name?: string,
  ) {
    const width = cells[0]?.length ?? document.width;
    const height = cells.length;
    commit((current) => ({
      ...current,
      name: name?.trim() || current.name,
      width,
      height,
      palette,
      cells,
      stitchActions,
      stitchCellColors: undefined,
      stitchPalette: stitchPaletteFromActions(stitchActions),
      stitchColors: {},
      instructions: {
        ...current.instructions,
        technique: "stranded",
        construction,
        patternUse: "repeat",
        trimBackground: false,
      },
      guides: { ...current.guides, repeatWidth: width, repeatHeight: height },
    }));
    clampActiveKnitProgress(width, height);
    setSelectedColor(palette[1]?.id ?? palette[0].id);
    setTool("pencil");
    setStructureAction(null);
    setStitchPickerOpen(false);
    setChartZoom(100);
    setSelection(null);
  }

  function openProject(nextDocument: ChartDocument) {
    commit(() => cloneDocument(nextDocument));
    setSelectedColor(nextDocument.palette[1]?.id ?? nextDocument.palette[0].id);
    setTool("pencil");
    setStructureAction(null);
    setStitchPickerOpen(false);
    setChartZoom(100);
    setSelection(null);
    clampActiveKnitProgress(nextDocument.width, nextDocument.height);
  }

  function prepareTabView(nextDocument: ChartDocument) {
    setSelectedColor(nextDocument.palette[1]?.id ?? nextDocument.palette[0].id);
    setTool("pencil");
    setStructureAction(null);
    setStitchPickerOpen(false);
    setSelection(null);
    setChartZoom(100);
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
    setTabs((current) => [...current, {
      id,
      document: nextDocument,
      knitProgress: { ...defaultKnitProgress },
      preview: createPreviewSettings(),
    }]);
    setPreviewDocuments((current) => ({ ...current, [id]: cloneDocument(nextDocument) }));
    setHistories((current) => ({ ...current, [id]: { past: [], future: [] } }));
    setActiveTabId(id);
    prepareTabView(nextDocument);
  }

  function duplicateTab() {
    if (tabs.length >= MAX_CHART_TABS) return;
    const id = `chart-${crypto.randomUUID()}`;
    const nextDocument = cloneDocument({ ...document, name: `${document.name || "Untitled chart"} copy` });
    setTabs((current) => [...current, {
      id,
      document: nextDocument,
      knitProgress: { ...defaultKnitProgress },
      preview: { ...preview },
    }]);
    setPreviewDocuments((current) => ({
      ...current,
      [id]: cloneDocument(current[activeTabId] ?? document),
    }));
    setHistories((current) => ({ ...current, [id]: { past: [], future: [] } }));
    setActiveTabId(id);
    prepareTabView(nextDocument);
  }

  function openTutorialExample(exampleId: TutorialExample["id"]) {
    if (tabs.length >= MAX_CHART_TABS) return;
    const example = tutorialExampleDocument(exampleId);
    if (!example) return;
    const id = `chart-${crypto.randomUUID()}`;
    const nextPreview = createPreviewSettings({
      repeatX: example.previewRepeats.x,
      repeatY: example.previewRepeats.y,
      renderedRepeatX: example.previewRepeats.x,
      renderedRepeatY: example.previewRepeats.y,
    });
    setTabs((current) => [...current, {
      id,
      document: example.document,
      knitProgress: { ...defaultKnitProgress },
      preview: nextPreview,
    }]);
    setPreviewDocuments((current) => ({ ...current, [id]: cloneDocument(example.document) }));
    setHistories((current) => ({ ...current, [id]: { past: [], future: [] } }));
    setActiveTabId(id);
    prepareTabView(example.document);
  }

  async function saveActiveChartToCloud() {
    if (!viewer) return;
    setCloudSaveState("saving");
    setCloudSaveMessage("Saving to My Charts…");
    try {
      const response = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, knitProgress: activeTab.knitProgress, preview: activeTab.preview }),
      });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Cloud save failed.");
      setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, cloudId: result.id } : tab));
      setCloudSaveState("saved");
      setCloudSaveMessage("Saved to My Charts");
    } catch (error) {
      setCloudSaveState("error");
      setCloudSaveMessage(error instanceof Error ? error.message : "Cloud save failed.");
    }
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
    setPreviewDocuments((current) => {
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

  const previewOutdated = JSON.stringify(document) !== JSON.stringify(previewDocument)
    || preview.repeatX !== preview.renderedRepeatX
    || preview.repeatY !== preview.renderedRepeatY
    || preview.repeatStyle !== preview.renderedRepeatStyle;
  const knitProgress = tabs.find((tab) => tab.id === activeTabId)?.knitProgress ?? defaultKnitProgress;

  if (!loaded) {
    return (
      <main className="app-shell chart-maker-loading" aria-busy="true" aria-label="Loading your KnitPlot workspace">
        <span className="brand-mark" aria-hidden="true" />
        <p>Opening your charts…</p>
      </main>
    );
  }

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
          <div className="workflow-actions" data-tour="workflow-actions">
            <button className="primary-button knit-mode-button" onClick={() => setKnitModeOpen(true)}>Knit mode</button>
            {viewer && aiConnected ? <AiChartGenerator document={document} onImport={importAiChart} signedIn={true} aiConnected={true} /> : null}
            <ImageImporter document={document} onImport={importImage} />
            <InstructionsView document={document} onSettingsChange={updateInstructionSettings} />
          </div>
          <ExportTools
            document={document}
            previewCanvasRef={previewCanvasRef}
            onOpenProject={openProject}
            accountsEnabled={accountsEnabled}
            signedIn={Boolean(viewer)}
            cloudId={activeTab.cloudId}
            cloudSaveState={cloudSaveState}
            cloudSaveMessage={cloudSaveMessage}
            onSaveToCloud={saveActiveChartToCloud}
            onImportPattern={() => setPatternImporterOpen(true)}
          />
          <OnboardingTour tabsFull={tabs.length >= MAX_CHART_TABS} onOpenExample={openTutorialExample} />
          {accountsEnabled ? <div className="account-actions">
            {viewer ? <>
              <Link className="account-chip" href="/account" title={viewer.email ?? "Account"}><AccountAvatar avatar={viewer.avatar} /></Link>
            </> : <Link className="header-link sign-in-link" href="/sign-in">Sign in</Link>}
          </div> : null}
        </div>
      </header>

      <div className="chart-tabs-bar" data-tour="chart-tabs">
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
                type="button"
                className="chart-tab-close"
                aria-label={`Close ${tab.document.name.trim() || "Untitled chart"}`}
                onClick={() => closeTab(tab.id)}
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
          <details className="settings-group" data-tour="colours" open>
            <summary>Colours <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="compact-section-action"><button className="text-button" onClick={addColor} disabled={document.palette.length >= 8}>+ Add colour</button></div>
              <div className="palette-list">
                {document.palette.map((color, index) => (
                  <div className={`palette-row ${selectedColor === color.id && !structureAction ? "selected" : ""}`} key={color.id}>
                    <button className="swatch-button" aria-label={`Use colour ${index + 1}`} onClick={() => { setSelectedColor(color.id); setStructureAction(null); setStitchPickerOpen(false); }}>
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

          <details className="settings-group stitch-settings" data-tour="stitches" open>
            <summary>Stitches <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="compact-section-action">
                <button
                  className={`text-button ${stitchPickerOpen ? "active" : ""}`}
                  onClick={() => {
                    if (stitchPickerOpen) setStructureAction(null);
                    setStitchPickerOpen((open) => !open);
                  }}
                >+ Add stitch</button>
              </div>
              {stitchPickerOpen ? (
                <div className="stitch-picker" aria-label="Stitch tools">
                  <p>Add a stitch type to this chart’s palette.</p>
                  <div>
                    {stitchActionOptions.filter((option): option is typeof option & { value: StitchPaletteAction } => option.value !== "knit" && !stitchPalette.includes(option.value as StitchPaletteAction)).map((option) => (
                      <button key={option.value} title={option.help} onClick={() => addStitchToPalette(option.value)}>{option.shortLabel}</button>
                    ))}
                    {stitchPalette.length === stitchActionOptions.filter((option) => option.value !== "knit").length ? <span>All stitch types have been added.</span> : null}
                  </div>
                </div>
              ) : null}
              <div className="palette-list">
                {stitchPalette.map((action) => {
                  const option = stitchActionOptions.find((item) => item.value === action);
                  const displayColor = stitchDisplayColor(document, action);
                  return (
                    <div className={`palette-row ${structureAction === action ? "selected" : ""}`} key={action}>
                      <button className="swatch-button" aria-label={`Draw ${option?.label ?? action}`} onClick={() => selectStitchAction(action)}>
                        <span className="stitch-swatch" style={{ background: displayColor, color: contrastTextColor(displayColor) }}>{action === "no-stitch" ? "—" : option?.shortLabel}</span>
                        <span className="palette-name">
                          <span>{option?.label ?? action}</span>
                          <span className="palette-hex">{document.stitchColors?.[action] ? displayColor.toUpperCase() : action === "no-stitch" ? "No fabric" : "Use yarn colour"}</span>
                        </span>
                      </button>
                      <input type="color" value={displayColor} aria-label={`Change ${option?.label ?? action} display colour`} onChange={(event) => changeStitchColor(action, event.target.value)} />
                      <button className="remove-button" aria-label={`Remove ${option?.label ?? action} from stitch palette`} title="Remove from palette; existing chart symbols will stay" onClick={() => removeStitchFromPalette(action)}>×</button>
                      {document.stitchColors?.[action] ? <button className="text-button stitch-color-reset" title="Reset display colour" onClick={() => resetStitchColor(action)}>{action === "no-stitch" ? "Reset" : "Use yarn colour"}</button> : null}
                    </div>
                  );
                })}
              </div>
              {!stitchPalette.length ? <p className="empty-stitch-palette">Add purl, cast-on, bind-off, shaping, or no-stitch cells to draw them onto your chart.</p> : null}
              <button className={`remove-stitch-tool ${structureAction === "knit" ? "selected" : ""}`} aria-pressed={structureAction === "knit"} onClick={() => selectStitchAction("knit")}>Remove stitch</button>
            </div>
          </details>

          <details className="settings-group" data-tour="chart-size" open>
            <summary>Chart size <span aria-hidden="true">⌄</span></summary>
            <div className="settings-content">
              <div className="two-fields">
                <label>Stitches<input type="number" min="1" max={MAX_CHART_STITCHES} value={dimensionDraft.width} onChange={(event) => setDimensionDraft((current) => ({ ...current, width: event.target.value }))} /></label>
                <label>Rows<input type="number" min="1" max={MAX_CHART_ROWS} value={dimensionDraft.height} onChange={(event) => setDimensionDraft((current) => ({ ...current, height: event.target.value }))} /></label>
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
              <div className="tool-group" data-tour="drawing-tools" aria-label="Drawing tools">
                <button className={tool === "pencil" ? "active" : ""} onClick={() => { setTool("pencil"); setStitchPickerOpen(false); }}>Draw</button>
                <button className={tool === "fill" ? "active" : ""} onClick={() => { setTool("fill"); setStitchPickerOpen(false); }}>Fill</button>
                <button className={tool === "eraser" && !structureAction ? "active" : ""} onClick={() => { setTool("eraser"); setStructureAction(null); setStitchPickerOpen(false); }}>Erase</button>
                <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}>Select</button>
                {selection && !structureAction ? <button className="selection-fill-button" onClick={fillSelection}>Fill selection</button> : null}
                {selection && structureAction ? <button className="selection-fill-button" onClick={applyStructureToSelection}>Apply {stitchActionOptions.find((option) => option.value === structureAction)?.shortLabel}</button> : null}
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
              <div className="transform-controls" aria-label={selection ? "Transform selection" : "Transform chart"}>
                <button aria-label={selection ? "Mirror selection left to right" : "Mirror chart left to right"} onClick={() => flipChart("horizontal")} title={selection ? "Mirror selection left to right" : "Mirror chart left to right"}>↔</button>
                <button aria-label={selection ? "Flip selection upside down" : "Flip chart upside down"} onClick={() => flipChart("vertical")} title={selection ? "Flip selection upside down" : "Flip chart upside down"}>↕</button>
                <button
                  className="rotate-chart-button"
                  aria-label={selection ? "Rotate selection 90 degrees clockwise" : "Rotate chart 90 degrees clockwise"}
                  onClick={rotateChartClockwise}
                  disabled={selection ? !selectionRotationFits() : document.width > MAX_CHART_ROWS || document.height > MAX_CHART_STITCHES}
                  title={selection
                    ? selectionRotationFits() ? "Rotate selection 90° clockwise" : "The rotated selection would extend beyond the chart"
                    : document.width > MAX_CHART_ROWS ? `Rotation would exceed ${MAX_CHART_ROWS} rows` : "Rotate chart 90° clockwise"}
                >90°</button>
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
          <ChartGrid document={document} tool={tool} structureAction={structureAction} selectedColor={selectedColor} zoom={chartZoom} selection={selection} onSelectionChange={setSelection} onStrokeStart={rememberCurrent} onPaint={paint} />
        </section>

        <details className="preview panel" data-tour="knitted-preview" open>
          <summary className="panel-heading collapsible-heading">
            <div className="preview-heading-copy"><h1>Knitted up</h1><span>approximate fabric at your gauge</span></div>
            <span className="collapse-label">Show / hide <span aria-hidden="true">⌄</span></span>
          </summary>
          <div className="preview-content">
            <div className="repeat-controls">
              <span>Repeats</span>
              <label className="repeat-style">Style<select value={preview.repeatStyle} onChange={(event) => updatePreviewSettings({ repeatStyle: event.target.value as RepeatStyle })}><option value="normal">Normal</option><option value="mirrored">Mirrored</option></select></label>
              <label>Across<select value={preview.repeatX} onChange={(event) => updatePreviewSettings({ repeatX: Number(event.target.value) })}><option>1</option><option>2</option><option>3</option></select></label>
              <label>Down<select value={preview.repeatY} onChange={(event) => updatePreviewSettings({ repeatY: Number(event.target.value) })}><option>1</option><option>2</option><option>3</option></select></label>
              <button className="primary-button refresh-preview-button" onClick={refreshPreview}>Refresh preview</button>
            </div>
            {previewOutdated ? <p className="preview-stale-note" role="status">Preview needs a refresh.</p> : null}
            <ConnectedKnitPreview document={previewDocument} repeatX={preview.renderedRepeatX} repeatY={preview.renderedRepeatY} repeatStyle={preview.renderedRepeatStyle} canvasRef={previewCanvasRef} showDiagnostics={false} />
          </div>
        </details>
      </div>

      {!knitModeOpen ? (
        <footer className="support-footer">
          <p>I am committed to keeping KnitPlot completely free and open source.</p>
          <p>If you’re enjoying it, you can <a href="https://ko-fi.com/syalr2" target="_blank" rel="noopener noreferrer">buy me a coffee <span aria-hidden="true">☕</span></a>.</p>
        </footer>
      ) : null}

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
              <button className="resize-choice" onClick={() => applyResize("scale")} disabled={Boolean(document.stitchActions)}>
                <strong>Scale design to fit</strong>
                <span>{document.stitchActions ? "Unavailable for imported instruction charts because stretching could duplicate or remove increases." : "Stretches or shrinks the whole design to fill the new chart size."}</span>
              </button>
            </div>
            <div className="import-actions"><button onClick={() => setResizeDialogOpen(false)}>Cancel</button></div>
          </section>
        </div>
      ) : null}

      {knitModeOpen ? <KnitMode document={document} progress={knitProgress} onProgressChange={updateKnitProgress} onSettingsChange={updateInstructionSettings} onClose={() => setKnitModeOpen(false)} /> : null}

      <PatternChartImporter
        open={patternImporterOpen}
        document={document}
        onClose={() => setPatternImporterOpen(false)}
        onOpenKnitMode={() => setKnitModeOpen(true)}
        onImport={importPatternChart}
      />

      {closingTabId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog close-tab-dialog" role="dialog" aria-modal="true" aria-labelledby="close-tab-title">
            <div className="import-dialog-heading">
              <div><p className="eyebrow">Close chart</p><h1 id="close-tab-title">Remove this chart tab?</h1></div>
              <button type="button" className="close-dialog" aria-label="Cancel closing chart" onClick={() => setClosingTabId(null)}>×</button>
            </div>
            <p className="import-note">
              “{tabs.find((tab) => tab.id === closingTabId)?.document.name || "Untitled chart"}” will be removed from this browser workspace. Save an editable project first if you want to keep a separate copy.
            </p>
            <div className="import-actions">
              <button type="button" onClick={() => setClosingTabId(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={confirmCloseTab}>Close chart</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
