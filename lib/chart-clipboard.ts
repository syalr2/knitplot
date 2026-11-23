import type { CellSelection, ChartDocument } from "./chart";
import {
  copySelectionBlock,
  reduceSelectionEdit,
  type SelectionBlock,
} from "./chart-selection";
import { MAX_PALETTE_COLOURS } from "./palette-colours";

export type ChartClipboard = {
  sourceTabId: string;
  block: SelectionBlock;
  palette: ChartDocument["palette"];
};

export function copyChartSelection(
  document: ChartDocument,
  selection: CellSelection | null,
  sourceTabId: string,
): ChartClipboard | null {
  const block = copySelectionBlock(document, selection);
  return block && { block, sourceTabId, palette: document.palette };
}

/** Paste at the destination selection (or top left), preserving the stitch grid. */
export function pasteChartSelection(
  document: ChartDocument,
  selection: CellSelection | null,
  tabId: string,
  clipboard: ChartClipboard,
) {
  const { block } = clipboard;
  const crossChart = tabId !== clipboard.sourceTabId;
  const row = selection ? Math.min(selection.startRow, selection.endRow) : 0;
  const column = selection
    ? Math.min(selection.startColumn, selection.endColumn)
    : 0;
  if (
    (crossChart || block.mask) &&
    (row + block.cells.length > document.height ||
      column + block.cells[0].length > document.width)
  )
    throw new Error(
      "The selection won’t fit here. Choose a spot with more room or resize the chart.",
    );

  const palette = [...document.palette];
  const sourceById = new Map(
    clipboard.palette.map((entry) => [entry.id, entry]),
  );
  const ids = new Map<string, string>();
  const cells = block.cells.map((line, r) =>
    line.map((id, c) => {
      if (row + r >= document.height || column + c >= document.width) return id;
      if (block.mask && !block.mask[r]?.[c]) return id;
      const remapped = ids.get(id);
      if (remapped) return remapped;
      const source = sourceById.get(id);
      if (!source) throw new Error("Couldn’t find a copied colour.");
      const sourceHex = source.hex.toLowerCase();
      const destination =
        (!crossChart &&
          palette.find(
            (entry) => entry.id === id && entry.hex.toLowerCase() === sourceHex,
          )) ||
        palette.find((entry) => entry.hex.toLowerCase() === sourceHex);
      if (destination) {
        ids.set(id, destination.id);
        return destination.id;
      }
      if (palette.length >= MAX_PALETTE_COLOURS)
        throw new Error(
          "This paste would exceed 20 colours. Remove an unused colour first.",
        );
      let index = palette.length;
      while (palette.some((entry) => entry.id === `paste-${index}`)) index++;
      const nextId = `paste-${index}`;
      palette.push({ ...source, id: nextId });
      ids.set(id, nextId);
      return nextId;
    }),
  );
  return reduceSelectionEdit(
    {
      document:
        palette.length === document.palette.length
          ? document
          : { ...document, palette },
      selection,
    },
    { type: "paste", block: { ...block, cells } },
  );
}
