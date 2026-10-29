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
      : Response.json({ ...data, version: 2 });
  };
  assert.equal(await saveCloudChart("id", data, "1", transport), "2");
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
          version: 2,
        });
  };
  await assert.rejects(
    saveCloudChart("id", data, "1", transport),
    /changed elsewhere/,
  );
  assert.deepEqual(methods, ["PUT", "GET"]);
});
test("legacy workspaces verify matching remote content without an unconditional write", async () => {
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, undefined);
    return Response.json({ ...data, version: 1 });
  };
  assert.equal(await saveCloudChart("id", data, undefined, transport), "1");
});

test("a stalled save has a deadline and a recoverable user-facing error", async () => {
  const transport: typeof fetch = async (_url, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    throw new DOMException("deadline", "TimeoutError");
  };
  await assert.rejects(
    saveCloudChart("id", data, "1", transport),
    /local copy is kept/,
  );
});

test("new saves send an integer revision and retain it as an opaque local token", async () => {
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).expectedVersion, 12);
    return Response.json({ version: 13 });
  };
  assert.equal(await saveCloudChart("id", data, "12", transport), "13");
});
test("legacy local timestamp revisions can save without losing pending edits", async () => {
  const timestamp = "2026-10-29 12:00:00.123456+00";
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.method, "PUT");
    assert.equal(
      JSON.parse(String(init?.body)).expectedVersion,
      "2026-10-29T12:00:00.123456+00:00",
    );
    return Response.json({ version: 2 });
  };
  assert.equal(await saveCloudChart("id", data, timestamp, transport), "2");
});
test("a missing server revision is not acknowledged as a successful save", async () => {
  const transport: typeof fetch = async () =>
    Response.json({ updatedAt: "legacy" });
  await assert.rejects(saveCloudChart("id", data, "1", transport), /revision/);
});
