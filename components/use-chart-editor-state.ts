import { useRef, useState } from "react";
import {
  defaultDocument,
  type CellSelection,
  type ChartDocument,
  type StitchAction,
  type Tool,
} from "@/lib/chart";
import type { ChartClipboard } from "@/lib/chart-clipboard";

/** Transient regular-chart tools. The clipboard intentionally survives chart changes. */
export function useChartEditorState() {
  const [tool, setTool] = useState<Tool>("pencil");
  const [structureAction, setStructureAction] = useState<StitchAction | null>(
    null,
  );
  const [stitchPickerOpen, setStitchPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(
    defaultDocument.palette[1].id,
  );
  const [chartZoom, setChartZoom] = useState(100);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [selectionMode, setSelectionMode] = useState<"area" | "element">(
    "area",
  );
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const selectionMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [selectionClipboard, setSelectionClipboard] =
    useState<ChartClipboard | null>(null);
  const [pasteError, setPasteError] = useState("");
  const [pickingYarn, setPickingYarn] = useState(false);
  const [pickingElementBackground, setPickingElementBackground] =
    useState(false);
  const [extraElementBackgroundColours, setExtraElementBackgroundColours] =
    useState<string[]>([]);

  function chooseDrawingTool(next: Tool) {
    setTool(next);
    setStitchPickerOpen(false);
    if (next === "eraser") setStructureAction(null);
    setPickingYarn(false);
    setPickingElementBackground(false);
  }

  function resetChartEditor(palette: ChartDocument["palette"]) {
    chooseDrawingTool("pencil");
    setSelectedColor(palette[1]?.id ?? palette[0].id);
    setStructureAction(null);
    setSelection(null);
    setChartZoom(100);
    setSelectionMode("area");
    setExtraElementBackgroundColours([]);
    setSelectionMenuOpen(false);
    setPasteError("");
  }

  return {
    tool,
    setTool,
    structureAction,
    setStructureAction,
    stitchPickerOpen,
    setStitchPickerOpen,
    selectedColor,
    setSelectedColor,
    chartZoom,
    setChartZoom,
    selection,
    setSelection,
    selectionMode,
    setSelectionMode,
    selectionMenuOpen,
    setSelectionMenuOpen,
    selectionMenuRef,
    selectionMenuButtonRef,
    selectionClipboard,
    setSelectionClipboard,
    pasteError,
    setPasteError,
    pickingYarn,
    setPickingYarn,
    pickingElementBackground,
    setPickingElementBackground,
    extraElementBackgroundColours,
    setExtraElementBackgroundColours,
    selectingElement: tool === "select" && selectionMode === "element",
    chooseDrawingTool,
    resetChartEditor,
  };
}
