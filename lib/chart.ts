export type Tool = "pencil" | "fill" | "eraser" | "select";

export type CellSelection = {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
};

export type PaletteColor = {
  id: string;
  hex: string;
};

export type ColorworkTechnique = "stranded" | "intarsia" | "duplicate";
export type ChartConstruction = "flat" | "round";
export type PatternUse = "single" | "repeat";
export type SymmetryMode = "none" | "horizontal" | "vertical" | "both";

export type ChartGuideSettings = {
  symmetry: SymmetryMode;
  showRepeatGuides: boolean;
  repeatWidth: number;
  repeatHeight: number;
};

export type InstructionSettings = {
  technique: ColorworkTechnique;
  construction: ChartConstruction;
  patternUse: PatternUse;
  trimBackground: boolean;
  showSymbols: boolean;
};

export const defaultInstructionSettings: InstructionSettings = {
  technique: "stranded",
  construction: "flat",
  patternUse: "single",
  trimBackground: false,
  showSymbols: false,
};

export type ChartDocument = {
  name: string;
  width: number;
  height: number;
  gaugeStitches: number;
  gaugeRows: number;
  gaugeMeasure: number;
  gaugeUnit: "cm" | "in";
  instructions: InstructionSettings;
  guides: ChartGuideSettings;
  palette: PaletteColor[];
  cells: string[][];
};

export const defaultDocument: ChartDocument = {
  name: "Untitled chart",
  width: 18,
  height: 14,
  gaugeStitches: 20,
  gaugeRows: 24,
  gaugeMeasure: 10,
  gaugeUnit: "cm",
  instructions: { ...defaultInstructionSettings },
  guides: {
    symmetry: "none",
    showRepeatGuides: false,
    repeatWidth: 18,
    repeatHeight: 14,
  },
  palette: [
    { id: "background", hex: "#f2eadf" },
    { id: "ink", hex: "#334c44" },
    { id: "accent", hex: "#c86f52" },
  ],
  cells: createCells(18, 14, "background"),
};

export function createCells(width: number, height: number, colorId: string) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => colorId));
}

export function resizeCells(
  cells: string[][],
  width: number,
  height: number,
  backgroundId: string,
) {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) => cells[row]?.[column] ?? backgroundId),
  );
}

export function resizeCellsCentered(
  cells: string[][],
  width: number,
  height: number,
  backgroundId: string,
) {
  const oldHeight = cells.length;
  const oldWidth = cells[0]?.length ?? 0;
  const offsetX = Math.floor((width - oldWidth) / 2);
  const offsetY = Math.floor((height - oldHeight) / 2);

  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      cells[row - offsetY]?.[column - offsetX] ?? backgroundId,
    ),
  );
}

export function scaleCells(cells: string[][], width: number, height: number) {
  const oldHeight = cells.length;
  const oldWidth = cells[0]?.length ?? 0;
  if (!oldWidth || !oldHeight) return [];

  return Array.from({ length: height }, (_, row) => {
    const sourceRow = Math.min(oldHeight - 1, Math.floor((row * oldHeight) / height));
    return Array.from({ length: width }, (_, column) => {
      const sourceColumn = Math.min(oldWidth - 1, Math.floor((column * oldWidth) / width));
      return cells[sourceRow][sourceColumn];
    });
  });
}

export function floodFill(
  cells: string[][],
  startRow: number,
  startColumn: number,
  replacement: string,
) {
  const target = cells[startRow]?.[startColumn];
  if (!target || target === replacement) return cells;

  const next = cells.map((row) => [...row]);
  const queue: Array<[number, number]> = [[startRow, startColumn]];
  let queueIndex = 0;
  next[startRow][startColumn] = replacement;

  while (queueIndex < queue.length) {
    const [row, column] = queue[queueIndex];
    queueIndex += 1;
    const neighbours: Array<[number, number]> = [
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1],
    ];

    for (const [nextRow, nextColumn] of neighbours) {
      if (next[nextRow]?.[nextColumn] === target) {
        next[nextRow][nextColumn] = replacement;
        queue.push([nextRow, nextColumn]);
      }
    }
  }

  return next;
}

export function cellAspectRatio(document: ChartDocument) {
  return document.gaugeRows / document.gaugeStitches;
}

export function finishedSize(document: ChartDocument) {
  return {
    width: (document.width / document.gaugeStitches) * document.gaugeMeasure,
    height: (document.height / document.gaugeRows) * document.gaugeMeasure,
  };
}

export function cloneDocument(document: ChartDocument): ChartDocument {
  return {
    ...document,
    instructions: { ...defaultInstructionSettings, ...document.instructions },
    guides: {
      symmetry: document.guides?.symmetry ?? "none",
      showRepeatGuides: document.guides?.showRepeatGuides ?? false,
      repeatWidth: document.guides?.repeatWidth ?? document.width,
      repeatHeight: document.guides?.repeatHeight ?? document.height,
    },
    palette: document.palette.map((color) => ({ ...color })),
    cells: document.cells.map((row) => [...row]),
  };
}
