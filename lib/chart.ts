export type Tool = "pencil" | "fill" | "eraser" | "select";

export const MAX_CHART_STITCHES = 200;
export const MAX_CHART_ROWS = 150;

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

export type StitchAction = "knit" | "purl" | "no-stitch" | "m1l" | "m1r" | "kfb" | "inc" | "ssk" | "k2tog" | "cdd" | "dec";
export type StitchPaletteAction = Exclude<StitchAction, "knit">;
export type StitchDisplayColors = Partial<Record<StitchPaletteAction, string>>;

export const stitchActionOptions: Array<{ value: StitchAction; label: string; shortLabel: string; help: string }> = [
  { value: "knit", label: "Normal stitch", shortLabel: "Knit", help: "Remove a shaping symbol and work this cell normally." },
  { value: "purl", label: "Purl stitch", shortLabel: "Purl", help: "Work this chart cell as a purl stitch." },
  { value: "no-stitch", label: "No stitch", shortLabel: "No stitch", help: "Mark a chart placeholder that is not worked on this row." },
  { value: "m1l", label: "Make 1 left", shortLabel: "M1L", help: "Add a left-leaning increase." },
  { value: "m1r", label: "Make 1 right", shortLabel: "M1R", help: "Add a right-leaning increase." },
  { value: "kfb", label: "Knit front and back", shortLabel: "kfb", help: "Increase one stitch by knitting into the front and back." },
  { value: "inc", label: "Generic increase", shortLabel: "Inc", help: "Add an increase when the exact method is specified elsewhere." },
  { value: "ssk", label: "Slip, slip, knit", shortLabel: "SSK", help: "Add a left-leaning decrease." },
  { value: "k2tog", label: "Knit 2 together", shortLabel: "k2tog", help: "Add a right-leaning decrease." },
  { value: "cdd", label: "Centred double decrease", shortLabel: "CDD", help: "Decrease three stitches to one, removing two stitches." },
  { value: "dec", label: "Generic decrease", shortLabel: "Dec", help: "Add a decrease when the exact method is specified elsewhere." },
];

export function stitchActionLabel(action: StitchAction) {
  return stitchActionOptions.find((option) => option.value === action)?.shortLabel ?? "Knit";
}

export function stitchActionSymbol(action: StitchPaletteAction) {
  return action === "purl" ? "P" : action === "no-stitch" ? "—" : stitchActionLabel(action);
}

export function isShapingAction(action: StitchAction) {
  return action !== "knit" && action !== "purl" && action !== "no-stitch";
}

export type StitchActionMath = { consumes: number; produces: number; change: number };

export function stitchActionMath(action: StitchAction): StitchActionMath {
  const counts = action === "no-stitch" ? { consumes: 0, produces: 0 }
    : action === "m1l" || action === "m1r" ? { consumes: 0, produces: 1 }
      : action === "kfb" || action === "inc" ? { consumes: 1, produces: 2 }
        : action === "ssk" || action === "k2tog" || action === "dec" ? { consumes: 2, produces: 1 }
          : action === "cdd" ? { consumes: 3, produces: 1 }
            : { consumes: 1, produces: 1 };
  return { ...counts, change: counts.produces - counts.consumes };
}

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
  stitchActions?: StitchAction[][];
  stitchPalette?: StitchPaletteAction[];
  stitchColors?: StitchDisplayColors;
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
  stitchPalette: [],
  stitchColors: {},
};

export function createCells(width: number, height: number, colorId: string) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => colorId));
}

export function createStitchActions(width: number, height: number, action: StitchAction = "knit") {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => action));
}

export function flipGrid<T>(grid: T[][], direction: "horizontal" | "vertical") {
  return direction === "horizontal"
    ? grid.map((row) => [...row].reverse())
    : [...grid].reverse().map((row) => [...row]);
}

export function rotateGridClockwise<T>(grid: T[][]) {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  return Array.from({ length: width }, (_, row) =>
    Array.from({ length: height }, (_, column) => grid[height - 1 - column][row]),
  );
}

export function stitchActionAt(document: ChartDocument, row: number, column: number): StitchAction {
  return document.stitchActions?.[row]?.[column] ?? "knit";
}

export function hasStructuralStitches(document: ChartDocument) {
  return document.stitchActions?.some((row) => row.some((action) => action !== "knit")) ?? false;
}

export function stitchPaletteFromActions(actions: StitchAction[][] | undefined): StitchPaletteAction[] {
  if (!actions) return [];
  const found = new Set<StitchPaletteAction>();
  actions.forEach((row) => row.forEach((action) => {
    if (action !== "knit") found.add(action);
  }));
  return stitchActionOptions
    .map((option) => option.value)
    .filter((action): action is StitchPaletteAction => action !== "knit" && found.has(action));
}

export function defaultStitchColor(action: StitchPaletteAction) {
  return action === "no-stitch" ? "#303632" : "#ffffff";
}

export function stitchDisplayColor(document: ChartDocument, action: StitchPaletteAction) {
  return document.stitchColors?.[action] ?? defaultStitchColor(action);
}

export function contrastTextColor(hex: string) {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((character) => character + character).join("")
    : value;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.52 ? "#17211d" : "#ffffff";
}

export function rowStitchSteps(document: ChartDocument, rowNumber: number) {
  const rowIndex = document.height - rowNumber;
  const source = document.cells[rowIndex] ?? [];
  return source.flatMap((colorId, column) => {
    const action = stitchActionAt(document, rowIndex, column);
    return action === "no-stitch" ? [] : [{ column, colorId, action }];
  });
}

export function rowStitchMath(document: ChartDocument, rowNumber: number) {
  const steps = rowStitchSteps(document, rowNumber);
  const startingStitches = steps.reduce((total, step) => total + stitchActionMath(step.action).consumes, 0);
  const endingStitches = steps.reduce((total, step) => total + stitchActionMath(step.action).produces, 0);
  return {
    startingStitches,
    endingStitches,
    change: endingStitches - startingStitches,
  };
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

export function resizeStitchActionsCentered(
  actions: StitchAction[][] | undefined,
  oldWidth: number,
  oldHeight: number,
  width: number,
  height: number,
) {
  if (!actions) return undefined;
  const offsetX = Math.floor((width - oldWidth) / 2);
  const offsetY = Math.floor((height - oldHeight) / 2);
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) => actions[row - offsetY]?.[column - offsetX] ?? "knit" as StitchAction),
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

export function scaleStitchActions(actions: StitchAction[][] | undefined, width: number, height: number) {
  if (!actions) return undefined;
  const oldHeight = actions.length;
  const oldWidth = actions[0]?.length ?? 0;
  if (!oldWidth || !oldHeight) return undefined;
  return Array.from({ length: height }, (_, row) => {
    const sourceRow = Math.min(oldHeight - 1, Math.floor((row * oldHeight) / height));
    return Array.from({ length: width }, (_, column) => {
      const sourceColumn = Math.min(oldWidth - 1, Math.floor((column * oldWidth) / width));
      return actions[sourceRow][sourceColumn];
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

export function floodFillActive(
  cells: string[][],
  actions: StitchAction[][] | undefined,
  startRow: number,
  startColumn: number,
  replacement: string,
) {
  if ((actions?.[startRow]?.[startColumn] ?? "knit") === "no-stitch") return cells;
  const target = cells[startRow]?.[startColumn];
  if (!target || target === replacement) return cells;

  const next = cells.map((row) => [...row]);
  const queue: Array<[number, number]> = [[startRow, startColumn]];
  let queueIndex = 0;
  next[startRow][startColumn] = replacement;

  while (queueIndex < queue.length) {
    const [row, column] = queue[queueIndex];
    queueIndex += 1;
    for (const [nextRow, nextColumn] of [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]] as Array<[number, number]>) {
      if (next[nextRow]?.[nextColumn] === target && (actions?.[nextRow]?.[nextColumn] ?? "knit") !== "no-stitch") {
        next[nextRow][nextColumn] = replacement;
        queue.push([nextRow, nextColumn]);
      }
    }
  }
  return next;
}

export function floodFillStitchActions(
  cells: string[][],
  actions: StitchAction[][] | undefined,
  startRow: number,
  startColumn: number,
  replacement: StitchAction,
) {
  const targetAction = actions?.[startRow]?.[startColumn] ?? "knit";
  const targetColor = cells[startRow]?.[startColumn];
  if (!targetColor || targetAction === replacement) return actions;

  const next = (actions ?? createStitchActions(cells[0]?.length ?? 0, cells.length))
    .map((row) => [...row]);
  const queue: Array<[number, number]> = [[startRow, startColumn]];
  let queueIndex = 0;
  next[startRow][startColumn] = replacement;

  while (queueIndex < queue.length) {
    const [row, column] = queue[queueIndex];
    queueIndex += 1;
    for (const [nextRow, nextColumn] of [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]] as Array<[number, number]>) {
      const nextAction = actions?.[nextRow]?.[nextColumn] ?? "knit";
      const matchesTarget = nextAction === targetAction
        && (targetAction !== "knit" || cells[nextRow]?.[nextColumn] === targetColor);
      if (matchesTarget && next[nextRow]?.[nextColumn] !== replacement) {
        next[nextRow][nextColumn] = replacement;
        queue.push([nextRow, nextColumn]);
      }
    }
  }

  return next.some((row) => row.some((action) => action !== "knit")) ? next : undefined;
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
    stitchActions: document.stitchActions?.map((row) => [...row]),
    stitchPalette: document.stitchPalette === undefined
      ? stitchPaletteFromActions(document.stitchActions)
      : [...document.stitchPalette],
    stitchColors: { ...document.stitchColors },
  };
}
