export const MAX_PALETTE_COLOURS = 20;

const starterColours = [
  "#d6a84b",
  "#6b7da8",
  "#884d67",
  "#5f795e",
  "#29282d",
  "#cb7758",
  "#4c8a90",
  "#e1a1a0",
  "#7e6654",
  "#a4ae70",
  "#65598e",
  "#e2cd93",
  "#9d6341",
  "#466684",
  "#789b65",
  "#ab6f9e",
  "#d7e3e0",
  "#b04950",
  "#78b7ba",
  "#4c3e36",
];

export function nextPaletteColour(palette: readonly string[]): string {
  const used = new Set(palette.map((hex) => hex.toLowerCase()));
  return starterColours.find((hex) => !used.has(hex)) ?? starterColours[0];
}
