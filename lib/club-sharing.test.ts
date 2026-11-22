import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createCells, defaultDocument } from "./chart";
import { renderClubShareArt } from "./club-share-art";
import { renderClubShareCard } from "./club-share-card";
import { clubShareLink, clubShareImagePath } from "./club-share-link";
import { fitImage } from "./image-fit";
import { yokeDocument } from "./yoke-document";
import { makeYokeFixture } from "./yoke-test-fixtures";

test("share links use a fixed non-identifying attribution flag", () => {
  const id = "c4a70eaa-94da-49f1-a2c8-830d6527e5a5";
  assert.equal(
    clubShareLink(id, "https://knitplot.art"),
    `https://knitplot.art/chart-club/${id}?via=share`,
  );
  assert.equal(clubShareImagePath(id), `/api/chart-club/share-image/${id}`);
});

test("fitting preserves extreme aspect ratios without cropping", () => {
  assert.deepEqual(fitImage(2000, 20, 1080, 730), { width: 1080, height: 10 });
  assert.deepEqual(fitImage(20, 2000, 1080, 730), { width: 7, height: 730 });
});

test("a wide shared cover includes fabric across the card without stretching it", async () => {
  const doc = {
    ...defaultDocument,
    width: 100,
    height: 4,
    cells: createCells(100, 4, "background"),
    palette: [{ id: "background", hex: "#af342d" }, defaultDocument.palette[1]],
  };
  const art = await renderClubShareArt(doc, {
    kind: "chart",
    across: 3,
    down: 1,
    style: "mirrored",
  });
  assert.equal(art.width, 1072);
  assert.ok(art.height < 24);
  const response = renderClubShareCard("A long border", "knitter", art);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  const sample = (x: number, y: number) =>
    data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3);
  for (const x of [90, 600, 1110]) {
    const [r, g, b] = sample(x, 261);
    assert.ok(
      r > g + 40 && r > b + 40,
      `whole border should be visible at x=${x}`,
    );
  }
  assert.deepEqual([...sample(600, 330)], [248, 246, 239]);
});

test("whole, half, one repeat, and sweater covers render from the selected yoke view", async () => {
  const doc = yokeDocument(makeYokeFixture());
  const results = await Promise.all(
    (["whole", "front", "back", "repeat", "sweater"] as const).map(
      async (view) => {
        const art = await renderClubShareArt(doc, {
          kind: "yoke",
          view,
          repeat: 0,
        });
        const image = await sharp(art.png).metadata();
        assert.equal(image.width, art.width);
        assert.equal(image.height, art.height);
        assert.ok(art.png.length > 2_000);
        return art;
      },
    ),
  );
  assert.ok(
    results[1].width / results[1].height > results[0].width / results[0].height,
  );
  assert.ok(Math.abs(results[4].width / results[4].height - 1.5) < 0.01);
  assert.ok(!results[0].png.equals(results[3].png));
});
