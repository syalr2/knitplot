import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultDocument } from "./chart";
import { clubSnapshot, readClubShare } from "./chart-club";
import { readProject } from "./project-file";
import { tutorialExampleDocument } from "./tutorial-examples";
import { readClubCover } from "./club-cover";

const request = {
  sourceId: "741eec8c-5d6a-4f10-85b6-98cbebbc042e",
  sourceVersion: 1,
  title: "Public chart title",
  confirmRights: true,
};

test("sharing always creates an editable copy and requires permission", () => {
  const options = readClubShare(request);
  assert.throws(() => readClubShare({ ...request, confirmRights: false }));
  assert.throws(() => readClubShare({ ...request, sourceVersion: 0 }));
  const snapshot = clubSnapshot(
    { ...defaultDocument, name: "private title" },
    options,
  );
  assert.ok(snapshot.editableDocument);
  assert.ok(!JSON.stringify(snapshot).includes("private title"));
});

test("publishing preserves gallery cover settings and ignores a client-supplied handle", () => {
  const cover = {
    kind: "chart",
    across: 3,
    down: 2,
    style: "mirrored",
  } as const;
  const options = readClubShare({
    ...request,
    cover,
    handle: "not_the_author",
  });
  assert.ok(!("handle" in options));
  assert.deepEqual(clubSnapshot(defaultDocument, options).summary.cover, cover);
  assert.throws(() =>
    readClubShare({ ...request, cover: { ...cover, down: 4 } }),
  );
  assert.deepEqual(readClubCover(defaultDocument, undefined, "repeat"), {
    kind: "chart",
    across: 2,
    down: 1,
    style: "normal",
  });
});

test("a yoke cover can select a specific repeat but not one outside the yoke", () => {
  const document = tutorialExampleDocument("tidal-fish-yoke")!.document;
  const cover = { kind: "yoke", view: "repeat", repeat: 2 } as const;
  const options = readClubShare({
    ...request,
    cover,
    shareYokeMeasurements: true,
  });
  assert.deepEqual(clubSnapshot(document, options).summary.cover, cover);
  assert.throws(
    () =>
      clubSnapshot(document, { ...options, cover: { ...cover, repeat: 39 } }),
    /cover view/,
  );
  assert.throws(() => clubSnapshot(defaultDocument, options), /cover view/);
});

test("an editable copy round-trips through KnitPlot import without private metadata", () => {
  const snapshot = clubSnapshot(
    { ...defaultDocument, email: "private@example.test" },
    readClubShare(request),
  );
  assert.ok(snapshot.editableDocument);
  assert.ok(!snapshot.editableDocument.includes("private@example.test"));
  assert.equal(
    readProject({
      format: "colorwork-chart",
      version: 2,
      document: JSON.parse(snapshot.editableDocument),
    }).name,
    request.title,
  );
});

test("yoke measurements require separate consent for editable copies", () => {
  const example = tutorialExampleDocument("tidal-fish-yoke");
  assert.ok(example);
  const { document } = example;
  const options = readClubShare(request);
  assert.throws(() => clubSnapshot(document, options), /measurements/);
  const snapshot = clubSnapshot(document, {
    ...options,
    shareYokeMeasurements: true,
  });
  assert.ok(snapshot.editableDocument?.includes("measurements"));
});
