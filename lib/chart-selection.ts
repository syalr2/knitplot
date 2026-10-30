import {
  copyStitchCellColors,
  createStitchActions,
  flipGrid,
  paintStitchCells,
  paintYarnCells,
  rotateGridClockwise,
  stitchActionAt,
  type CellSelection,
  type ChartDocument,
  type StitchAction,
} from "./chart";

export type SelectionBlock = {
  cells: string[][];
  stitchActions: StitchAction[][];
  stitchCellColors: (string | null)[][];
};
type SelectionState = {
  document: ChartDocument;
  selection: CellSelection | null;
};
export type SelectionEdit =
  | { type: "cut" }
  | { type: "paste"; block: SelectionBlock }
  | { type: "move"; rows: number; columns: number }
  | { type: "transform"; transform: "horizontal" | "vertical" | "rotate" }
  | { type: "fill-yarn"; color: string }
  | { type: "fill-stitch"; stitch: StitchAction };

function bounds(selection: CellSelection | null) {
  return (
    selection && {
      startRow: Math.min(selection.startRow, selection.endRow),
      endRow: Math.max(selection.startRow, selection.endRow),
      startColumn: Math.min(selection.startColumn, selection.endColumn),
      endColumn: Math.max(selection.startColumn, selection.endColumn),
    }
  );
}
function inside(document: ChartDocument, area: CellSelection) {
  return (
    area.startRow >= 0 &&
    area.startColumn >= 0 &&
    area.endRow < document.height &&
    area.endColumn < document.width
  );
}
function targets(area: CellSelection) {
  const cells: [number, number][] = [];
  for (let row = area.startRow; row <= area.endRow; row++)
    for (let column = area.startColumn; column <= area.endColumn; column++)
      cells.push([row, column]);
  return cells;
}
export function copySelectionBlock(
  document: ChartDocument,
  selection: CellSelection | null,
): SelectionBlock | null {
  const area = bounds(selection);
  if (!area || !inside(document, area)) return null;
  return {
    cells: document.cells
      .slice(area.startRow, area.endRow + 1)
      .map((row) => row.slice(area.startColumn, area.endColumn + 1)),
    stitchCellColors: copyStitchCellColors(document)
      .slice(area.startRow, area.endRow + 1)
      .map((row) => row.slice(area.startColumn, area.endColumn + 1)),
    stitchActions: Array.from(
      { length: area.endRow - area.startRow + 1 },
      (_, row) =>
        Array.from(
          { length: area.endColumn - area.startColumn + 1 },
          (_, column) =>
            stitchActionAt(
              document,
              area.startRow + row,
              area.startColumn + column,
            ),
        ),
    ),
  };
}
export function canRotateSelection(
  document: ChartDocument,
  selection: CellSelection | null,
) {
  const area = bounds(selection);
  return (
    !!area &&
    inside(document, area) &&
    area.startRow + area.endColumn - area.startColumn + 1 <= document.height &&
    area.startColumn + area.endRow - area.startRow + 1 <= document.width
  );
}
function editableLayers(document: ChartDocument) {
  return {
    cells: document.cells.map((row) => [...row]),
    stitchCellColors: copyStitchCellColors(document),
    stitchActions: (
      document.stitchActions ??
      createStitchActions(document.width, document.height)
    ).map((row) => [...row]),
  };
}
function clear(
  layers: SelectionBlock,
  area: CellSelection,
  background: string,
) {
  for (const [row, column] of targets(area)) {
    layers.cells[row][column] = background;
    layers.stitchCellColors[row][column] = null;
    layers.stitchActions[row][column] = "knit";
  }
}
function write(
  layers: SelectionBlock,
  block: SelectionBlock,
  startRow: number,
  startColumn: number,
) {
  block.cells.forEach((row, dy) =>
    row.forEach((color, dx) => {
      const y = startRow + dy,
        x = startColumn + dx;
      if (layers.cells[y]?.[x] === undefined) return;
      layers.cells[y][x] = color;
      layers.stitchActions[y][x] = block.stitchActions[dy]?.[dx] ?? "knit";
      layers.stitchCellColors[y][x] = block.stitchCellColors[dy]?.[dx] ?? null;
    }),
  );
}

/** Pure document/selection reducer. History, tab ownership and clipboard lifetime stay with the editor. */
export function reduceSelectionEdit(
  state: SelectionState,
  action: SelectionEdit,
): SelectionState {
  const { document } = state;
  const area = bounds(state.selection);
  if (area && !inside(document, area)) return state;
  if (action.type !== "paste" && !area) return state;
  if (action.type === "fill-yarn" || action.type === "fill-stitch") {
    return {
      document:
        action.type === "fill-yarn"
          ? paintYarnCells(document, targets(area!), action.color)
          : paintStitchCells(document, targets(area!), action.stitch),
      selection: null,
    };
  }
  let selection = state.selection;
  const layers = editableLayers(document);
  if (action.type === "cut") clear(layers, area!, document.palette[0].id);
  else {
    let startRow = area?.startRow ?? 0,
      startColumn = area?.startColumn ?? 0;
    let block =
      action.type === "paste"
        ? action.block
        : copySelectionBlock(document, area)!;
    if (!block.cells.length || !block.cells[0]?.length) return state;
    if (action.type === "move") {
      startRow += action.rows;
      startColumn += action.columns;
      if (
        !inside(document, {
          startRow,
          startColumn,
          endRow: area!.endRow + action.rows,
          endColumn: area!.endColumn + action.columns,
        })
      )
        return state;
    }
    if (action.type === "transform") {
      if (action.transform === "rotate" && !canRotateSelection(document, area))
        return state;
      const transform = <T>(grid: T[][]) =>
        action.transform === "rotate"
          ? rotateGridClockwise(grid)
          : flipGrid(grid, action.transform);
      block = {
        cells: transform(block.cells),
        stitchActions: transform(block.stitchActions),
        stitchCellColors: transform(block.stitchCellColors),
      };
    }
    if (action.type !== "paste") clear(layers, area!, document.palette[0].id);
    write(layers, block, startRow, startColumn);
    selection = {
      startRow,
      startColumn,
      endRow:
        startRow + Math.min(block.cells.length, document.height - startRow) - 1,
      endColumn:
        startColumn +
        Math.min(block.cells[0].length, document.width - startColumn) -
        1,
    };
  }
  return {
    document: {
      ...document,
      ...layers,
      stitchActions: layers.stitchActions.some((row) =>
        row.some((stitch) => stitch !== "knit"),
      )
        ? layers.stitchActions
        : undefined,
    },
    selection,
  };
}
