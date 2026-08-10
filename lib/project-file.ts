import { type ChartDocument, cloneDocument } from "@/lib/chart";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readProject(value: unknown): ChartDocument {
  if (!isRecord(value) || value.format !== "colorwork-chart" || value.version !== 1 || !isRecord(value.document)) {
    throw new Error("This is not a KnitPlot file.");
  }
  const candidate = value.document;
  const width = candidate.width;
  const height = candidate.height;
  const palette = candidate.palette;
  const cells = candidate.cells;
  const instructions = candidate.instructions;
  const guides = candidate.guides;
  const validNumber = (number: unknown) => typeof number === "number" && Number.isFinite(number) && number > 0 && number <= 100;

  if (
    typeof candidate.name !== "string" || candidate.name.length > 200 ||
    !Number.isInteger(width) || !validNumber(width) ||
    !Number.isInteger(height) || !validNumber(height) ||
    !validNumber(candidate.gaugeStitches) || !validNumber(candidate.gaugeRows) || !validNumber(candidate.gaugeMeasure) ||
    (candidate.gaugeUnit !== "cm" && candidate.gaugeUnit !== "in") ||
    !Array.isArray(palette) || palette.length < 2 || palette.length > 8 ||
    !Array.isArray(cells) || cells.length !== height
  ) {
    throw new Error("This project file is incomplete or damaged.");
  }

  const colors = palette.every((color) =>
    isRecord(color) && typeof color.id === "string" && color.id.length > 0 &&
    typeof color.hex === "string" && /^#[0-9a-f]{6}$/i.test(color.hex),
  );
  const colorIds = new Set(palette.map((color) => isRecord(color) ? color.id : ""));
  const validCells = cells.every((row) =>
    Array.isArray(row) && row.length === width && row.every((colorId) => typeof colorId === "string" && colorIds.has(colorId)),
  );
  const validInstructions = instructions === undefined || (
    isRecord(instructions) &&
    ["stranded", "intarsia", "duplicate"].includes(String(instructions.technique)) &&
    ["flat", "round"].includes(String(instructions.construction)) &&
    ["single", "repeat"].includes(String(instructions.patternUse)) &&
    (instructions.trimBackground === undefined || typeof instructions.trimBackground === "boolean") &&
    (instructions.showSymbols === undefined || typeof instructions.showSymbols === "boolean")
  );
  const validGuides = guides === undefined || (
    isRecord(guides) &&
    ["none", "horizontal", "vertical", "both"].includes(String(guides.symmetry)) &&
    typeof guides.showRepeatGuides === "boolean" &&
    Number.isInteger(guides.repeatWidth) && Number(guides.repeatWidth) >= 1 && Number(guides.repeatWidth) <= Number(width) &&
    Number.isInteger(guides.repeatHeight) && Number(guides.repeatHeight) >= 1 && Number(guides.repeatHeight) <= Number(height)
  );
  if (!colors || colorIds.size !== palette.length || !validCells || !validInstructions || !validGuides) {
    throw new Error("This project file contains invalid colours or stitches.");
  }

  return cloneDocument(candidate as unknown as ChartDocument);
}
