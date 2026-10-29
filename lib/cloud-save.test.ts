import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDocument } from "./chart";
import { newChartTab, tabPayload, tabSnapshot } from "./workspace";
import { readCloudChartPayload } from "./cloud-charts";
import { saveCloudChart } from "./cloud-save";

const data = tabPayload(newChartTab(defaultDocument, "one"));
test("snapshots compare canonical content rather than property insertion order", () => {
  assert.equal(tabSnapshot(data), tabSnapshot(readCloudChartPayload(data)));
});
test("a completed write with a lost acknowledgement is reconciled without overwriting", async () => {
  const methods: string[] = [];
  const transport: typeof fetch = async (_url, init) => {
    methods.push(init?.method ?? "GET");
    return init?.method === "PUT"
      ? Response.json({ error: "conflict" }, { status: 409 })
      : Response.json({ ...data, updatedAt: "new" });
  };
  assert.equal(await saveCloudChart("id", data, "old", transport), "new");
  assert.deepEqual(methods, ["PUT", "GET"]);
});
test("different server content is not silently rebased or overwritten", async () => {
  const methods: string[] = [];
  const transport: typeof fetch = async (_url, init) => {
    methods.push(init?.method ?? "GET");
    return init?.method === "PUT"
      ? Response.json({ error: "conflict" }, { status: 409 })
      : Response.json({
          ...data,
          document: { ...data.document, name: "someone else's edit" },
          updatedAt: "new",
        });
  };
  await assert.rejects(
    saveCloudChart("id", data, "old", transport),
    /changed elsewhere/,
  );
  assert.deepEqual(methods, ["PUT", "GET"]);
});
test("legacy workspaces verify matching remote content without an unconditional write", async () => {
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, undefined);
    return Response.json({ ...data, updatedAt: "version" });
  };
  assert.equal(
    await saveCloudChart("id", data, undefined, transport),
    "version",
  );
});

test("a stalled save has a deadline and a recoverable user-facing error", async () => {
  const transport: typeof fetch = async (_url, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    throw new DOMException("deadline", "TimeoutError");
  };
  await assert.rejects(
    saveCloudChart("id", data, "v1", transport),
    /local copy is kept/,
  );
});
