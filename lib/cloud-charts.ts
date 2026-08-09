import { ChartDocument, cloneDocument } from "@/lib/chart";

export type CloudChartPayload = {
  document: ChartDocument;
  knitProgress: Record<string, unknown>;
  preview: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCloudChartPayload(value: unknown): CloudChartPayload {
  if (!isRecord(value) || !isRecord(value.document)) throw new Error("The chart data was not valid.");
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
  ) throw new Error("The chart data was incomplete.");

  const colorsAreValid = palette.every((color) => isRecord(color) && typeof color.id === "string" && color.id.length > 0 && typeof color.hex === "string" && /^#[0-9a-f]{6}$/i.test(color.hex));
  const colorIds = new Set(palette.map((color) => isRecord(color) ? color.id : ""));
  const cellsAreValid = cells.every((row) => Array.isArray(row) && row.length === width && row.every((id) => typeof id === "string" && colorIds.has(id)));
  const instructionsAreValid = isRecord(instructions) &&
    ["stranded", "intarsia", "duplicate"].includes(String(instructions.technique)) &&
    ["flat", "round"].includes(String(instructions.construction)) &&
    ["single", "repeat"].includes(String(instructions.patternUse)) &&
    typeof instructions.trimBackground === "boolean" && typeof instructions.showSymbols === "boolean";
  const guidesAreValid = isRecord(guides) &&
    ["none", "horizontal", "vertical", "both"].includes(String(guides.symmetry)) &&
    typeof guides.showRepeatGuides === "boolean" &&
    Number.isInteger(guides.repeatWidth) && Number(guides.repeatWidth) >= 1 && Number(guides.repeatWidth) <= Number(width) &&
    Number.isInteger(guides.repeatHeight) && Number(guides.repeatHeight) >= 1 && Number(guides.repeatHeight) <= Number(height);
  if (!colorsAreValid || colorIds.size !== palette.length || !cellsAreValid || !instructionsAreValid || !guidesAreValid) {
    throw new Error("The chart colours or stitches were not valid.");
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 500_000) throw new Error("The chart data was too large.");
  return {
    document: cloneDocument(candidate as unknown as ChartDocument),
    knitProgress: isRecord(value.knitProgress) ? value.knitProgress : {},
    preview: isRecord(value.preview) ? value.preview : {},
  };
}

