/** false targets the source repeat; true links every repeat. */
export type YokeRepeatScope = boolean | readonly number[];

export function repeatTargets(
  scope: YokeRepeatScope,
  count: number,
  source: number,
) {
  if (scope === true) return Array.from({ length: count }, (_, i) => i);
  if (scope === false) return [source];
  return scope.includes(source) ? scope : [];
}
