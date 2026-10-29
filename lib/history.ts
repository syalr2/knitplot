import { cloneDocument, type ChartDocument } from "./chart";
export type TabHistory = { past: ChartDocument[]; future: ChartDocument[] };
export const emptyHistory = (): TabHistory => ({ past: [], future: [] });
export function remember(
  history: TabHistory,
  document: ChartDocument,
): TabHistory {
  return {
    past: [...history.past.slice(-39), cloneDocument(document)],
    future: [],
  };
}
export function travelHistory(
  history: TabHistory,
  document: ChartDocument,
  direction: "undo" | "redo",
) {
  const source = direction === "undo" ? history.past : history.future;
  if (!source.length) return { document, history };
  return direction === "undo"
    ? {
        document: cloneDocument(source[source.length - 1]),
        history: {
          past: source.slice(0, -1),
          future: [cloneDocument(document), ...history.future].slice(0, 40),
        },
      }
    : {
        document: cloneDocument(source[0]),
        history: {
          past: [...history.past, cloneDocument(document)].slice(-40),
          future: source.slice(1),
        },
      };
}
