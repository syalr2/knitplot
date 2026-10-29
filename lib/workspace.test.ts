import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDocument } from "./chart";
import {
  newChartTab,
  openCloudTab,
  readWorkspace,
  workspaceSave,
  tabSnapshot,
} from "./workspace";

for (const version of [1, 2, 3, 4])
  test(`migrates workspace version ${version}`, () => {
    const tab = newChartTab(defaultDocument, "one");
    const input = { ...workspaceSave([tab], "one"), version };
    assert.equal(readWorkspace(input).workspace.tabs[0].preview.repeatX, 1);
    assert.deepEqual(
      readWorkspace(input).workspace.tabs[0].document,
      tab.document,
    );
  });
test("migrates single-document browser saves", () => {
  assert.equal(readWorkspace(defaultDocument).workspace.tabs.length, 1);
});
test("browser saves preserve both legacy and integer cloud revision tokens", () => {
  for (const cloudVersion of ["2026-10-29 12:00:00.123456+00", "42"]) {
    const tab = { ...newChartTab(defaultDocument, "one"), cloudVersion };
    assert.equal(
      readWorkspace(workspaceSave([tab], "one")).workspace.tabs[0].cloudVersion,
      cloudVersion,
    );
  }
});
test("one corrupt tab does not destroy good tabs", () => {
  const good = newChartTab(defaultDocument, "good");
  const result = readWorkspace({
    ...workspaceSave([good], "missing"),
    tabs: [null, good, { id: "bad", document: null }],
  });
  assert.equal(result.rejectedTabs, 2);
  assert.equal(result.workspace.activeTabId, "good");
});
test("unknown versions are not silently overwritten", () => {
  assert.throws(() =>
    readWorkspace({
      ...workspaceSave([newChartTab(defaultDocument, "a")], "a"),
      version: 999,
    }),
  );
});
test("duplicate tab ids are rejected", () => {
  const tab = newChartTab(defaultDocument, "a");
  assert.equal(readWorkspace(workspaceSave([tab, tab], "a")).rejectedTabs, 1);
});
test("opening a cloud chart preserves its local working copy", () => {
  const local = {
    ...newChartTab(defaultDocument, "local"),
    cloudId: "server",
    document: { ...defaultDocument, name: "unsaved" },
  };
  const remote = {
    ...newChartTab(defaultDocument, "remote"),
    cloudId: "server",
  };
  const opened = openCloudTab(workspaceSave([local], "local"), remote);
  assert.equal(opened.tabs[0].document.name, "unsaved");
  assert.equal(opened.activeTabId, "local");
});

test("opening a clean cloud tab refreshes renamed or remotely updated content", () => {
  const local = { ...newChartTab(defaultDocument, "local"), cloudId: "server" };
  const clean = { ...local, cloudSnapshot: tabSnapshot(local) };
  const remote = {
    ...newChartTab({ ...defaultDocument, name: "renamed" }, "remote"),
    cloudId: "server",
  };
  const opened = openCloudTab(workspaceSave([clean], "local"), remote);
  assert.equal(opened.tabs[0].id, "local");
  assert.equal(opened.tabs[0].document.name, "renamed");
});
