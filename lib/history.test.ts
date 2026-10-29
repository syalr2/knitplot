import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDocument } from "./chart";
import { emptyHistory, remember, travelHistory } from "./history";
test("undo and redo are isolated document copies", () => {
  const changed = { ...defaultDocument, name: "changed" };
  const history = remember(emptyHistory(), defaultDocument);
  const undone = travelHistory(history, changed, "undo");
  assert.equal(undone.document.name, defaultDocument.name);
  assert.equal(
    travelHistory(undone.history, undone.document, "redo").document.name,
    "changed",
  );
  undone.document.cells[0][0] = "changed";
  assert.notEqual(defaultDocument.cells[0][0], "changed");
});
test("new edits discard redo and limit history to forty", () => {
  let history = emptyHistory();
  for (let i = 0; i < 60; i++)
    history = remember(history, { ...defaultDocument, name: String(i) });
  assert.equal(history.past.length, 40);
  const undone = travelHistory(history, defaultDocument, "undo");
  assert.equal(remember(undone.history, defaultDocument).future.length, 0);
});
