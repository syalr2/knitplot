import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspacePersistence } from "./workspace-persistence";
import { newChartTab, workspaceSave } from "./workspace";
import { defaultDocument } from "./chart";
const workspace = workspaceSave([newChartTab(defaultDocument, "one")], "one");
test("consecutive local writes update their expected revision", () => {
  let stored: string | null = null;
  const writer = new WorkspacePersistence(
    {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
    null,
  );
  writer.save(workspace);
  writer.save({ ...workspace, activeTabId: "two" });
  assert.equal(JSON.parse(stored!).activeTabId, "two");
});
test("a different window's save is never overwritten", () => {
  let stored: string | null = null;
  const writer = new WorkspacePersistence(
    {
      getItem: () => stored,
      setItem: (_key, value) => {
        stored = value;
      },
    },
    null,
  );
  stored = "other window's work";
  assert.throws(() => writer.save(workspace), /another window/);
  assert.equal(stored, "other window's work");
});
test("an intervening write after restoration but before first save is detected", () => {
  const writer = new WorkspacePersistence(
    {
      getItem: () => "newer",
      setItem: () => assert.fail("must not overwrite"),
    },
    "loaded",
  );
  assert.throws(() => writer.save(workspace), /another window/);
});
test("quota errors propagate and remain retryable", () => {
  let quotaFull = true;
  let stored: string | null = null;
  const writer = new WorkspacePersistence(
    {
      getItem: () => stored,
      setItem: (_key, value) => {
        if (quotaFull) throw new Error("QuotaExceededError");
        stored = value;
      },
    },
    null,
  );
  assert.throws(() => writer.save(workspace), /Quota/);
  quotaFull = false;
  writer.save(workspace);
  assert.ok(stored);
});
