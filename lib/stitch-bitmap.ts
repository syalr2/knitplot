import { type ChartDocument, stitchActionAt } from "./chart";

/** Raw yarn colours, in chart order: one opaque pixel per chart cell. */
export function stitchBitmap(
  document: ChartDocument,
  noStitchColorId?: string,
) {
  const palette = new Map(
    document.palette.map(({ id, hex }) => [
      id,
      [1, 3, 5].map((offset) =>
        Number.parseInt(hex.slice(offset, offset + 2), 16),
      ),
    ]),
  );
  const pixels = new Uint8ClampedArray(document.width * document.height * 4);
  for (let row = 0; row < document.height; row++) {
    for (let column = 0; column < document.width; column++) {
      const id =
        stitchActionAt(document, row, column) === "no-stitch"
          ? noStitchColorId
          : document.cells[row][column];
      const rgb = id ? palette.get(id) : undefined;
      if (!rgb) throw new Error("Choose a yarn colour for no-stitch cells.");
      pixels.set([...rgb, 255], (row * document.width + column) * 4);
    }
  }
  return { width: document.width, height: document.height, pixels };
}
