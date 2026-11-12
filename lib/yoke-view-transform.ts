export type ViewPoint = { x: number; y: number };
/** Counter-clockwise presentation only: neck at left, lower edge at right. */
export function presentYokePoint(
  point: ViewPoint,
  width: number,
  sideways: boolean,
): ViewPoint {
  return sideways ? { x: point.y, y: width - point.x } : point;
}
export function unpresentYokePoint(
  point: ViewPoint,
  width: number,
  sideways: boolean,
): ViewPoint {
  return sideways ? { x: width - point.y, y: point.x } : point;
}
export function fitYokeZoom(
  width: number,
  height: number,
  scale: number,
  availableWidth: number,
  availableHeight: number,
) {
  return Math.max(
    1,
    Math.min(
      400,
      Math.floor(
        100 *
          Math.min(
            Math.max(1, availableWidth - 20) / (width * scale),
            Math.max(1, availableHeight - 20) / (height * scale),
          ),
      ),
    ),
  );
}
