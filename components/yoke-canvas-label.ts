/** Keep chart labels readable when only the viewing surface is rotated. */
export function drawYokeLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rotation: number,
) {
  if (!rotation) {
    context.fillText(text, x, y);
    return;
  }
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillText(text, 0, 0);
  context.restore();
}
