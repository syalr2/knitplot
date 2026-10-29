import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudSaveQueue } from "./cloud-save-queue";
import { HttpError } from "./http";

test("unchanged cloud charts do not cause writes", async () => {
  let writes = 0;
  const queue = new CloudSaveQueue(
    async () => {
      writes++;
      return "v2";
    },
    () => {},
    0,
  );
  queue.enqueue("one", { data: "a", snapshot: "a", version: "v1" }, "a");
  await queue.flushAll();
  assert.equal(writes, 0);
});
test("switching tabs leaves both charts queued independently", async () => {
  const writes: string[] = [];
  const queue = new CloudSaveQueue(
    async (id: string) => {
      writes.push(id);
      return "v2";
    },
    () => {},
    0,
  );
  queue.enqueue("one", { data: "a", snapshot: "a", version: "v1" }, "old");
  queue.enqueue("two", { data: "b", snapshot: "b", version: "v1" }, "old");
  await queue.flushAll();
  assert.deepEqual(writes.sort(), ["one", "two"]);
});
test("edits during an in-flight save are serialised using its new revision", async () => {
  const writes: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new CloudSaveQueue(
    async (_id, data: string, version) => {
      writes.push(`${data}:${version}`);
      if (data === "a") await gate;
      return data === "a" ? "v2" : "v3";
    },
    () => {},
    0,
  );
  queue.enqueue("one", { data: "a", snapshot: "a", version: "v1" }, "old");
  const first = queue.flush("one");
  queue.enqueue("one", { data: "b", snapshot: "b", version: "v1" }, "old");
  release();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(writes, ["a:v1", "b:v2"]);
  assert.equal(queue.hasPending(), false);
});
test("a conflict stops writes instead of retrying an overwrite", async () => {
  let writes = 0;
  const statuses: string[] = [];
  const queue = new CloudSaveQueue(
    async () => {
      writes++;
      throw new HttpError("conflict", 409);
    },
    (_id, state) => statuses.push(state),
    0,
  );
  queue.enqueue("one", { data: "a", snapshot: "a", version: "v1" }, "old");
  await queue.flush("one");
  queue.enqueue("one", { data: "b", snapshot: "b", version: "v1" }, "old");
  await queue.flushAll();
  assert.equal(writes, 1);
  assert.equal(statuses.at(-1), "error");
});

test("undoing a pending change clears saving status without a redundant write", async () => {
  const states: string[] = [];
  let writes = 0;
  const queue = new CloudSaveQueue(
    async () => {
      writes++;
      return "v2";
    },
    (_id, state) => states.push(state),
    0,
  );
  queue.enqueue(
    "one",
    { data: "edited", snapshot: "edited", version: "v1" },
    "original",
  );
  queue.enqueue(
    "one",
    { data: "original", snapshot: "original", version: "v1" },
    "original",
  );
  await queue.flushAll();
  assert.equal(writes, 0);
  assert.equal(states.at(-1), "saved");
  assert.equal(queue.hasPending(), false);
});

test("all flush callers wait for an in-flight save and its latest queued edit", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: string[] = [];
  const queue = new CloudSaveQueue(
    async (_id, data: string) => {
      if (data === "first") await gate;
      writes.push(data);
      return "new-version";
    },
    () => {},
    0,
  );
  queue.enqueue(
    "one",
    { data: "first", snapshot: "first", version: "v1" },
    "original",
  );
  const first = queue.flush("one");
  queue.enqueue(
    "one",
    { data: "latest", snapshot: "latest", version: "v1" },
    "original",
  );
  const closeFlush = queue.flush("one");
  release();
  await closeFlush;
  assert.deepEqual(writes, ["first", "latest"]);
  assert.equal(queue.hasPending("one"), false);
  await first;
  queue.forgetSaved("one");
  assert.equal(queue.hasPending(), false);
});

test("keeping a separate local copy detaches its failed save from leave-page warnings", async () => {
  const queue = new CloudSaveQueue(
    async () => {
      throw new HttpError("conflict", 409);
    },
    () => {},
    0,
  );
  queue.enqueue(
    "one",
    { data: "local", snapshot: "local", version: "v1" },
    "old",
  );
  await queue.flush("one");
  assert.equal(queue.hasPending(), true);
  queue.forgetFailed("one");
  assert.equal(queue.hasPending(), false);
});

test("conflict recovery discards the stopped queue and uses the loaded cloud revision", async () => {
  const versions: (string | undefined)[] = [];
  const conflicts: (boolean | undefined)[] = [];
  const queue = new CloudSaveQueue(
    async (_id, _data: string, version) => {
      versions.push(version);
      if (version === "1") throw new HttpError("conflict", 409);
      return "3";
    },
    (_id, _state, _message, _saved, conflict) => conflicts.push(conflict),
    0,
  );
  queue.enqueue(
    "one",
    { data: "local", snapshot: "local", version: "1" },
    "old",
  );
  await queue.flush("one");
  assert.equal(queue.isStopped("one"), true);
  assert.equal(conflicts.at(-1), true);
  queue.forgetFailed("one");
  assert.equal(queue.hasPending(), false);
  queue.enqueue(
    "one",
    { data: "cloud", snapshot: "cloud", version: "2" },
    "cloud",
  );
  queue.enqueue(
    "one",
    { data: "edited", snapshot: "edited", version: "2" },
    "cloud",
  );
  await queue.flush("one");
  assert.deepEqual(versions, ["1", "2"]);
  assert.equal(conflicts.at(-1), undefined);
});

test("network failures are not presented as cloud conflicts", async () => {
  let conflict: boolean | undefined;
  const queue = new CloudSaveQueue(
    async () => {
      throw new TypeError("offline");
    },
    (_id, _state, _message, _saved, flag) => {
      conflict = flag;
    },
    0,
  );
  queue.enqueue(
    "one",
    { data: "local", snapshot: "local", version: "1" },
    "old",
  );
  await queue.flush("one");
  assert.equal(conflict, false);
});
