export type ChartSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: string;
  palette: string[];
  preview: string[][];
};

const FALLBACK_LIGHT = "#f2eadf";
const FALLBACK_DARK = "#334c44";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function safeHex(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function chartSummaryFromRow(row: Record<string, unknown>): ChartSummary {
  const document = record(row.document) ?? {};
  const rawCells = Array.isArray(document.cells) ? document.cells : [];
  const sourceCells = rawCells.filter(Array.isArray) as unknown[][];
  const sourceHeight = sourceCells.length;
  const sourceWidth = sourceCells[0]?.length ?? 0;
  const width = positiveInteger(document.width, sourceWidth || 1);
  const height = positiveInteger(document.height, sourceHeight || 1);

  const colorById = new Map<string, string>();
  const palette: string[] = [];
  if (Array.isArray(document.palette)) {
    for (const item of document.palette) {
      const color = record(item);
      const id = typeof color?.id === "string" ? color.id : null;
      const hex = safeHex(color?.hex);
      if (!id || !hex) continue;
      colorById.set(id, hex);
      if (!palette.includes(hex)) palette.push(hex);
    }
  }
  if (!palette.length) palette.push(FALLBACK_LIGHT, FALLBACK_DARK);

  const maxPreviewWidth = 32;
  const maxPreviewHeight = 24;
  let previewWidth = Math.min(sourceWidth || width, maxPreviewWidth);
  let previewHeight = Math.max(1, Math.round((previewWidth * (sourceHeight || height)) / Math.max(1, sourceWidth || width)));
  if (previewHeight > maxPreviewHeight) {
    previewHeight = maxPreviewHeight;
    previewWidth = Math.max(1, Math.round((previewHeight * (sourceWidth || width)) / Math.max(1, sourceHeight || height)));
  }
  const backgroundId = Array.isArray(document.palette) && record(document.palette[0]) && typeof record(document.palette[0])?.id === "string"
    ? String(record(document.palette[0])?.id)
    : null;
  const preview = Array.from({ length: previewHeight }, (_, rowIndex) => {
    return Array.from({ length: previewWidth }, (_, columnIndex) => {
      if (!sourceHeight || !sourceWidth) return palette[0];
      const rowStart = Math.floor((rowIndex * sourceHeight) / previewHeight);
      const rowEnd = Math.max(rowStart + 1, Math.ceil(((rowIndex + 1) * sourceHeight) / previewHeight));
      const columnStart = Math.floor((columnIndex * sourceWidth) / previewWidth);
      const columnEnd = Math.max(columnStart + 1, Math.ceil(((columnIndex + 1) * sourceWidth) / previewWidth));
      const counts = new Map<string, number>();
      for (let sourceRow = rowStart; sourceRow < Math.min(rowEnd, sourceHeight); sourceRow += 1) {
        for (let sourceColumn = columnStart; sourceColumn < Math.min(columnEnd, sourceWidth); sourceColumn += 1) {
          const id = sourceCells[sourceRow]?.[sourceColumn];
          if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      const colorId = [...counts].sort((a, b) => b[1] - a[1] || Number(a[0] === backgroundId) - Number(b[0] === backgroundId))[0]?.[0] ?? null;
      return typeof colorId === "string" ? colorById.get(colorId) ?? palette[0] : palette[0];
    });
  });

  const rawDate = new Date(String(row.updated_at ?? ""));
  return {
    id: String(row.id),
    name: String(row.name || document.name || "Untitled chart"),
    width,
    height,
    updatedAt: Number.isNaN(rawDate.getTime()) ? new Date(0).toISOString() : rawDate.toISOString(),
    palette: palette.slice(0, 6),
    preview,
  };
}
