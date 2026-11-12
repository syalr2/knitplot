export type YokeSweaterView = "sweater-front" | "sweater-back";
export type YokePreviewView =
  "whole" | "front" | "back" | "repeat" | YokeSweaterView;

export function isYokeSweaterView(
  view: YokePreviewView | undefined,
): view is YokeSweaterView {
  return view === "sweater-front" || view === "sweater-back";
}

/** Match the editor's front-half convention; the back is its complement. */
export function inYokePreviewHalf(
  view: "front" | "back",
  column: number,
  width: number,
) {
  const front =
    (column - Math.floor(width / 4) + width) % width < Math.ceil(width / 2);
  return view === "front" ? front : !front;
}
