import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDocument } from "./chart";
import {
  newChartTab,
  workspaceSave,
  MAX_CHART_TABS,
  STORAGE_KEY,
  readWorkspace,
} from "./workspace";
import { WorkspacePersistence } from "./workspace-persistence";
import { loadCloudVersion } from "./cloud-recovery";

const cloudId = "a21d4c9a-1122-4234-8234-123456789abc";
function fixture() {
  let workspace = workspaceSave(
    [
      {
        ...newChartTab({ ...defaultDocument, name: "My edits" }, "local"),
        cloudId,
        cloudVersion: "1",
      },
    ],
    "local",
  );
  const events: string[] = [];
  const saved = new Map<string, string>();
  const writer = new WorkspacePersistence(
    {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        saved.set(key, value);
      },
    },
    null,
  );
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, undefined);
    assert.ok(init?.signal);
    return Response.json({
      id: cloudId,
      version: 2,
      document: { ...defaultDocument, name: "Cloud edits" },
    });
  };
  const options = {
    tabId: "local",
    cloudId,
    newTabId: "remote",
    transport,
    getWorkspace: () => workspace,
    canRecover: () => true,
    persist: (next: typeof workspace) => {
      writer.save(next);
      events.push("persist");
    },
    commit: (next: typeof workspace) => {
      events.push("commit");
      workspace = next;
    },
    clearConflict: () => {
      events.push("clear");
    },
  };
  return {
    options,
    events,
    readSaved: () =>
      readWorkspace(JSON.parse(saved.get(STORAGE_KEY)!)).workspace,
    getWorkspace: () => workspace,
    setWorkspace: (next: typeof workspace) => {
      workspace = next;
    },
  };
}
test("cloud recovery persists both versions before replacing the working view", async () => {
  const f = fixture();
  const original = f.getWorkspace();
  const before = structuredClone(original);
  await loadCloudVersion(f.options);
  const next = f.getWorkspace();
  assert.equal(next.tabs.length, 2);
  assert.equal(next.activeTabId, "remote");
  assert.equal(next.tabs[0].document.name, "My edits (local copy)");
  assert.equal(next.tabs[0].cloudId, undefined);
  assert.equal(next.tabs[0].cloudVersion, undefined);
  assert.equal(next.tabs[1].document.name, "Cloud edits");
  assert.equal(next.tabs[1].cloudVersion, "2");
  assert.equal(next.tabs[1].cloudId, cloudId);
  assert.deepEqual(original, before);
  assert.deepEqual(
    { ...next.tabs[0].document, name: before.tabs[0].document.name },
    before.tabs[0].document,
  );
  assert.deepEqual(f.events, ["persist", "clear", "commit"]);
  assert.deepEqual(
    f.readSaved(),
    readWorkspace(JSON.parse(JSON.stringify(next))).workspace,
  );
});
test("edits made during the request are preserved, and switching tabs is respected", async () => {
  const f = fixture();
  const response = await f.options.transport("/unused", {
    signal: AbortSignal.timeout(1000),
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = loadCloudVersion({
    ...f.options,
    transport: async () => {
      await gate;
      return response;
    },
  });
  const latest = structuredClone(f.getWorkspace());
  latest.tabs[0].document.name = "Newest local edits";
  latest.tabs.push(newChartTab(defaultDocument, "other"));
  latest.activeTabId = "other";
  f.setWorkspace(latest);
  release();
  await pending;
  assert.equal(
    f.getWorkspace().tabs[0].document.name,
    "Newest local edits (local copy)",
  );
  assert.equal(f.getWorkspace().activeTabId, "other");
});
for (const failure of [
  "network",
  "missing",
  "malformed",
  "revision",
  "wrong-chart",
  "quota",
  "other-window",
  "tabs-full",
  "closed",
  "queue-resumed",
]) {
  test(`failed recovery (${failure}) leaves local work and its stopped queue unchanged`, async () => {
    const f = fixture();
    const options = { ...f.options };
    if (failure === "network")
      options.transport = async () => {
        throw new TypeError("offline");
      };
    if (failure === "missing")
      options.transport = async () =>
        Response.json({ error: "Not found" }, { status: 404 });
    if (failure === "malformed")
      options.transport = async () => Response.json({ document: null });
    if (failure === "revision")
      options.transport = async () =>
        Response.json({ id: cloudId, document: defaultDocument });
    if (failure === "wrong-chart")
      options.transport = async () =>
        Response.json({
          id: "other-chart",
          version: 2,
          document: defaultDocument,
        });
    if (failure === "quota" || failure === "other-window")
      options.persist = () => {
        throw new Error(failure);
      };
    if (failure === "tabs-full") {
      const current = f.getWorkspace();
      while (current.tabs.length < MAX_CHART_TABS)
        current.tabs.push(
          newChartTab(defaultDocument, `tab-${current.tabs.length}`),
        );
    }
    if (failure === "closed")
      options.transport = async () => {
        const r = await f.options.transport("/unused", {
          signal: AbortSignal.timeout(1000),
        });
        f.setWorkspace(
          workspaceSave([newChartTab(defaultDocument, "other")], "other"),
        );
        return r;
      };
    if (failure === "queue-resumed") options.canRecover = () => false;
    const before = structuredClone(f.getWorkspace());
    await assert.rejects(loadCloudVersion(options));
    assert.deepEqual(f.events, []);
    if (failure !== "closed") assert.deepEqual(f.getWorkspace(), before);
  });
}
