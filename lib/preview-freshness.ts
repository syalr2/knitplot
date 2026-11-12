import type { ChartDocument } from "./chart";

function sameContent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameContent(value, b[index]))
    );
  const left = Object.entries(a).filter(([, value]) => value !== undefined);
  const right = b as Record<string, unknown>;
  return (
    left.length ===
      Object.values(right).filter((value) => value !== undefined).length &&
    left.every(([key, value]) => sameContent(value, right[key]))
  );
}

/** Compare render inputs. Shared references are a fast path, not proof that
 * independently restored copies (such as Undo) changed the knitted fabric. */
export function samePreviewFabric(a: ChartDocument, b: ChartDocument) {
  if (a === b) return true;
  if (
    a.gaugeStitches / a.gaugeRows !== b.gaugeStitches / b.gaugeRows ||
    a.height !== b.height
  )
    return false;

  if (a.yoke && b.yoke) {
    return (
      sameContent(a.yoke.palette, b.yoke.palette) &&
      sameContent(a.yoke.measurements, b.yoke.measurements) &&
      sameContent(a.yoke.shortRows, b.yoke.shortRows) &&
      sameContent(a.yoke.program, b.yoke.program) &&
      (Boolean(a.yoke.program) ||
        (sameContent(a.yoke.cells, b.yoke.cells) &&
          sameContent(a.yoke.events, b.yoke.events)))
    );
  }
  if (a.yoke || b.yoke) return false;

  return (
    a.width === b.width &&
    sameContent(a.palette, b.palette) &&
    sameContent(a.cells, b.cells) &&
    (a.stitchActions && b.stitchActions
      ? sameContent(a.stitchActions, b.stitchActions)
      : !(a.stitchActions ?? b.stitchActions)?.some((row) =>
          row.some((action) => action !== "knit"),
        ))
  );
}
