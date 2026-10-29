import {
  ChartDocument,
  StitchAction,
  stitchActionAt,
  stitchActionMath,
} from "./chart";

/** Some imported charts draw a decrease on an input-count course and show
 * its narrower output on the next course. Adapt only when both neighbouring
 * counts confirm that convention. Consumed companion cells still exist in
 * the source chart; they are not separate output loops in the preview.
 * Ambiguous/mixed shaping is deliberately left to the unresolved diagnostic. */
export function adaptInputCountDecreases(document: ChartDocument): {
  document: ChartDocument;
  rows: number[];
} {
  const rows: number[] = [],
    actions = document.stitchActions?.map((row) => [...row]);
  if (!actions) return { document, rows };
  const isDecrease = (a: StitchAction) =>
    a === "ssk" || a === "k2tog" || a === "cdd" || a === "dec";
  const isOrdinary = (a: StitchAction) => a === "knit" || a === "purl";
  const visible = (r: number) =>
    Array.from({ length: document.width }, (_, c) =>
      stitchActionAt(document, r, c),
    );
  for (let r = 1; r < document.height - 1; r++) {
    const current = visible(r),
      below = visible(r + 1),
      above = visible(r - 1);
    if (
      current.some((a) => !isOrdinary(a) && a !== "no-stitch" && !isDecrease(a))
    )
      continue;
    const decreases = current.flatMap((a, c) => (isDecrease(a) ? [c] : []));
    if (!decreases.length) continue;
    const count = current.filter((a) => a !== "no-stitch").length;
    const reduction = decreases.reduce(
      (s, c) => s + stitchActionMath(current[c]).consumes - 1,
      0,
    );
    const liveBelow = below.reduce(
      (s, a) => s + (a === "bind-off" ? 0 : stitchActionMath(a).produces),
      0,
    );
    // The next course must be ordinary (plus placeholders): another shaping
    // action there would make the row-count evidence ambiguous.
    if (
      above.some((a) => !isOrdinary(a) && a !== "no-stitch") ||
      liveBelow !== count ||
      above.filter((a) => a !== "no-stitch").length !== count - reduction
    )
      continue;
    const consumed = new Set<number>();
    let valid = true;
    for (const c of decreases) {
      const directions =
        current[c] === "cdd" ? [-1, 1] : [current[c] === "k2tog" ? -1 : 1];
      for (const direction of directions) {
        const companion = c + direction;
        // Do not cross a placeholder, another operation, or a prior pair.
        if (
          companion < 0 ||
          companion >= document.width ||
          !isOrdinary(current[companion]) ||
          consumed.has(companion)
        ) {
          valid = false;
          break;
        }
        consumed.add(companion);
      }
      if (!valid) break;
    }
    if (!valid || consumed.size !== reduction) continue;
    // Confirm the resulting live count for each individual garment section.
    // A matching total must not steal a stitch from the opposite shoulder.
    for (let start = 0; start < document.width;) {
      if (current[start] === "no-stitch") {
        start++;
        continue;
      }
      let end = start + 1;
      while (end < document.width && current[end] !== "no-stitch") end++;
      const output =
        end - start - [...consumed].filter((c) => c >= start && c < end).length;
      const next = above
        .slice(start, end)
        .filter((a) => a !== "no-stitch").length;
      if (output !== next) valid = false;
      start = end;
    }
    if (!valid) continue;
    for (const c of consumed) actions[r][c] = "no-stitch";
    rows.push(r);
  }
  return {
    document: rows.length ? { ...document, stitchActions: actions } : document,
    rows,
  };
}
