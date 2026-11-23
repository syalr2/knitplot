import {
  chartCellDisplayColor,
  stitchActionAt,
  type CellSelection,
  type ChartDocument,
} from "./chart";

/** A painted field can differ from the first palette entry. Only override the
 * default when the same yarn covers most of the perimeter and three corners. */
export function elementBackground(document: ChartDocument) {
  const { cells, width, height, palette } = document;
  const fallback = palette[0].id;
  if (width < 3 || height < 3) return fallback;
  const corners = [
    cells[0][0],
    cells[0][width - 1],
    cells[height - 1][0],
    cells[height - 1][width - 1],
  ];
  const candidate = corners.find(
    (id) => corners.filter((colour) => colour === id).length >= 3,
  );
  if (!candidate || candidate === fallback) return fallback;
  let matches = 0;
  for (let c = 0; c < width; c++) {
    matches += Number(cells[0][c] === candidate);
    matches += Number(cells[height - 1][c] === candidate);
  }
  for (let r = 1; r < height - 1; r++) {
    matches += Number(cells[r][0] === candidate);
    matches += Number(cells[r][width - 1] === candidate);
  }
  return matches >= 0.6 * (2 * width + 2 * (height - 2)) ? candidate : fallback;
}

/** Select a connected foreground motif, including stitches that meet diagonally. */
export function selectChartElement(
  document: ChartDocument,
  row: number,
  column: number,
  extraBackgroundColours: readonly string[] = [],
): CellSelection | null {
  const { width, height, cells } = document;
  const background = elementBackground(document);
  const yarns = new Map(
    document.palette.map(({ id, hex }) => [id, hex.toLowerCase()]),
  );
  const backgroundHex = yarns.get(background);
  const ignored = new Set(
    extraBackgroundColours.map((hex) => hex.toLowerCase()),
  );
  function foreground(r: number, c: number) {
    if (r < 0 || r >= height || c < 0 || c >= width) return false;
    const yarn = yarns.get(cells[r][c]);
    if (
      yarn === backgroundHex ||
      stitchActionAt(document, r, c) === "no-stitch"
    )
      return false;
    return (
      !ignored.size ||
      !ignored.has(chartCellDisplayColor(document, r, c, yarn).toLowerCase())
    );
  }
  if (!foreground(row, column)) return null;
  let startRow = row,
    endRow = row,
    startColumn = column,
    endColumn = column;
  const seen = new Uint8Array(width * height);
  const queue = [row * width + column];
  seen[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const r = Math.floor(queue[i] / width);
    const c = queue[i] % width;
    startRow = Math.min(startRow, r);
    endRow = Math.max(endRow, r);
    startColumn = Math.min(startColumn, c);
    endColumn = Math.max(endColumn, c);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const next = (r + dy) * width + c + dx;
        if (seen[next] || !foreground(r + dy, c + dx)) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return {
    startRow,
    endRow,
    startColumn,
    endColumn,
    mask: Array.from({ length: endRow - startRow + 1 }, (_, r) =>
      Array.from({ length: endColumn - startColumn + 1 }, (_, c) =>
        Boolean(seen[(startRow + r) * width + startColumn + c]),
      ),
    ),
  };
}

export function isSelectedCell(
  selection: CellSelection,
  row: number,
  column: number,
) {
  const r0 = Math.min(selection.startRow, selection.endRow);
  const c0 = Math.min(selection.startColumn, selection.endColumn);
  return (
    row >= r0 &&
    row <= Math.max(selection.startRow, selection.endRow) &&
    column >= c0 &&
    column <= Math.max(selection.startColumn, selection.endColumn) &&
    (!selection.mask || Boolean(selection.mask[row - r0]?.[column - c0]))
  );
}

/** One SVG path outlines selected stitches and any holes, not the bounding box. */
export function elementSelectionOutline(
  selection: CellSelection,
  aspect: number,
) {
  const { mask } = selection;
  if (!mask) return "";
  const row = Math.min(selection.startRow, selection.endRow);
  const column = Math.min(selection.startColumn, selection.endColumn);
  const edges: string[] = [];
  mask.forEach((line, r) =>
    line.forEach((selected, c) => {
      if (!selected) return;
      const x = (column + c) * aspect;
      const right = (column + c + 1) * aspect;
      const y = row + r;
      if (!mask[r - 1]?.[c]) edges.push(`M${x},${y}H${right}`);
      if (!mask[r + 1]?.[c]) edges.push(`M${x},${y + 1}H${right}`);
      if (!line[c - 1]) edges.push(`M${x},${y}V${y + 1}`);
      if (!line[c + 1]) edges.push(`M${right},${y}V${y + 1}`);
    }),
  );
  return edges.join("");
}
