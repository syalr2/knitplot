import {
  type ChartDocument,
  cloneDocument,
  MAX_CHART_ROWS,
  MAX_CHART_STITCHES,
  validStitchCellColors,
} from "@/lib/chart";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readProject(value: unknown): ChartDocument {
  if (
    !isRecord(value) ||
    value.format !== "colorwork-chart" ||
    ![1, 2].includes(Number(value.version)) ||
    !isRecord(value.document)
  ) {
    throw new Error("This is not a KnitPlot file.");
  }
  const candidate = value.document;
  const width = candidate.width;
  const height = candidate.height;
  const palette = candidate.palette;
  const cells = candidate.cells;
  const instructions = candidate.instructions;
  const guides = candidate.guides;
  const stitchActions = candidate.stitchActions;
  const stitchPalette = candidate.stitchPalette;
  const stitchColors = candidate.stitchColors;
  const validMeasurement = (number: unknown) =>
    typeof number === "number" &&
    Number.isFinite(number) &&
    number > 0 &&
    number <= 100;

  if (
    typeof candidate.name !== "string" ||
    candidate.name.length > 200 ||
    !Number.isInteger(width) ||
    typeof width !== "number" ||
    width < 1 ||
    width > MAX_CHART_STITCHES ||
    !Number.isInteger(height) ||
    typeof height !== "number" ||
    height < 1 ||
    height > MAX_CHART_ROWS ||
    !validMeasurement(candidate.gaugeStitches) ||
    !validMeasurement(candidate.gaugeRows) ||
    !validMeasurement(candidate.gaugeMeasure) ||
    (candidate.gaugeUnit !== "cm" && candidate.gaugeUnit !== "in") ||
    !Array.isArray(palette) ||
    palette.length < 2 ||
    palette.length > 8 ||
    !Array.isArray(cells) ||
    cells.length !== height
  ) {
    throw new Error("This project file is incomplete or damaged.");
  }

  const colors = palette.every(
    (color) =>
      isRecord(color) &&
      typeof color.id === "string" &&
      color.id.length > 0 &&
      typeof color.hex === "string" &&
      /^#[0-9a-f]{6}$/i.test(color.hex),
  );
  const colorIds = new Set(
    palette.map((color) => (isRecord(color) ? color.id : "")),
  );
  const validCells = cells.every(
    (row) =>
      Array.isArray(row) &&
      row.length === width &&
      row.every(
        (colorId) => typeof colorId === "string" && colorIds.has(colorId),
      ),
  );
  const validStitchActions =
    stitchActions === undefined ||
    (Array.isArray(stitchActions) &&
      stitchActions.length === height &&
      stitchActions.every(
        (row) =>
          Array.isArray(row) &&
          row.length === width &&
          row.every((action) =>
            [
              "knit",
              "purl",
              "no-stitch",
              "cast-on",
              "m1l",
              "m1r",
              "kfb",
              "inc",
              "ssk",
              "k2tog",
              "cdd",
              "dec",
              "bind-off",
            ].includes(String(action)),
          ),
      ));
  const validStitchPalette =
    stitchPalette === undefined ||
    (Array.isArray(stitchPalette) &&
      stitchPalette.length <= 12 &&
      new Set(stitchPalette).size === stitchPalette.length &&
      stitchPalette.every((action) =>
        [
          "purl",
          "no-stitch",
          "cast-on",
          "m1l",
          "m1r",
          "kfb",
          "inc",
          "ssk",
          "k2tog",
          "cdd",
          "dec",
          "bind-off",
        ].includes(String(action)),
      ));
  const validStitchColors =
    stitchColors === undefined ||
    (isRecord(stitchColors) &&
      Object.entries(stitchColors).every(
        ([action, color]) =>
          [
            "purl",
            "no-stitch",
            "cast-on",
            "m1l",
            "m1r",
            "kfb",
            "inc",
            "ssk",
            "k2tog",
            "cdd",
            "dec",
            "bind-off",
          ].includes(action) &&
          typeof color === "string" &&
          /^#[0-9a-f]{6}$/i.test(color),
      ));
  const validInstructions =
    instructions === undefined ||
    (isRecord(instructions) &&
      ["stranded", "intarsia", "duplicate"].includes(
        String(instructions.technique),
      ) &&
      ["flat", "round"].includes(String(instructions.construction)) &&
      ["single", "repeat"].includes(String(instructions.patternUse)) &&
      (instructions.trimBackground === undefined ||
        typeof instructions.trimBackground === "boolean") &&
      (instructions.showSymbols === undefined ||
        typeof instructions.showSymbols === "boolean"));
  const validGuides =
    guides === undefined ||
    (isRecord(guides) &&
      ["none", "horizontal", "vertical", "both"].includes(
        String(guides.symmetry),
      ) &&
      typeof guides.showRepeatGuides === "boolean" &&
      Number.isInteger(guides.repeatWidth) &&
      Number(guides.repeatWidth) >= 1 &&
      Number(guides.repeatWidth) <= Number(width) &&
      Number.isInteger(guides.repeatHeight) &&
      Number(guides.repeatHeight) >= 1 &&
      Number(guides.repeatHeight) <= Number(height));
  if (
    !colors ||
    colorIds.size !== palette.length ||
    !validCells ||
    !validStitchActions ||
    !validStitchPalette ||
    !validStitchColors ||
    !validInstructions ||
    !validGuides ||
    !validStitchCellColors(candidate.stitchCellColors, width, height)
  ) {
    throw new Error("This project file contains invalid colours or stitches.");
  }

  return cloneDocument(candidate as unknown as ChartDocument);
}
