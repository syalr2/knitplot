import { test, expect, type Page } from "@playwright/test";
import type { YokeProject } from "../lib/yoke-project";
import { yokeGeometry, type YokeView } from "../lib/yoke-layout";
const KEY = "knitplot-yoke-draft-v1";
const saved = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as YokeProject,
    KEY,
  );
async function paint(
  page: Page,
  project: YokeProject,
  view: YokeView,
  row: number,
  column: number,
) {
  const canvas = page.getByRole("img", { name: /drawing canvas/ });
  const box = (await canvas.boundingBox())!;
  const g = yokeGeometry(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    view,
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  const angle = g.startAngle + ((column + 0.5) / g.shownCounts[row]) * g.arc;
  const radius = g.inner + (row + 0.5) * g.radialHeight;
  const x =
    view === "chart"
      ? (1000 - g.shownCounts[row] * g.cellWidth) / 2 +
        (column + 0.5) * g.cellWidth
      : g.cx + Math.cos(angle) * radius;
  const y =
    view === "chart"
      ? 760 - (row + 0.5) * g.rowHeight
      : g.cy + Math.sin(angle) * radius;
  await canvas.click({
    position: { x: (x / 1000) * box.width, y: (y / 800) * box.height },
  });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/yoke");
  await expect(
    page.getByRole("heading", { name: /KnitPlot · Yoke designer/ }),
  ).toBeVisible();
  await expect
    .poll(async () => (await saved(page))?.format)
    .toBe("knitplot-yoke");
});

test("all views share yarn cells, repeat editing, zoom, history and saved drafts", async ({
  page,
}) => {
  const original = await saved(page);
  await paint(page, original, "repeat", 2, 1);
  await expect
    .poll(
      async () => (await saved(page)).cells[2].filter((c) => c === 1).length,
    )
    .toBe(12);
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await page.getByLabel("Edit all repeats").uncheck();
  await page.getByRole("button", { name: "Paint with yarn colour 3" }).click();
  await paint(page, original, "whole", 2, 2);
  await expect
    .poll(
      async () => (await saved(page)).cells[2].filter((c) => c === 2).length,
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Standard chart", exact: true })
    .click();
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("200");
  await paint(page, original, "chart", original.cells.length - 1, 0);
  await expect.poll(async () => (await saved(page)).cells.at(-1)![0]).toBe(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await saved(page)).cells.at(-1)![0]).toBe(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await saved(page)).cells.at(-1)![0]).toBe(2);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /KnitPlot · Yoke designer/ }),
  ).toBeVisible();
  expect((await saved(page)).cells.at(-1)![0]).toBe(2);
});

test("measurement drafts accept intermediate values, validate schedule, and preserve work until applied", async ({
  page,
}) => {
  const original = await saved(page);
  await page.getByLabel("Repeats around yoke", { exact: true }).fill("1");
  await expect(
    page.getByLabel("Repeats around yoke", { exact: true }),
  ).toHaveValue("1");
  await page.getByLabel("Repeats around yoke", { exact: true }).fill("10");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calculated targets" }),
  ).toBeVisible();
  expect((await saved(page)).measurements.repeats).toBe(
    original.measurements.repeats,
  );
  await page.getByLabel("Increase 1 round", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Apply plan to drawing" }).click();
  await expect(page.locator(".yoke-designer [role=alert]")).toContainText(
    "valid whole rounds",
  );
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply plan to drawing" }).click();
  await expect
    .poll(async () => (await saved(page)).measurements.repeats)
    .toBe(10);
});

test("a second window cannot silently overwrite the first window's yoke draft", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await second.goto("/yoke");
  await expect(
    second.getByRole("heading", { name: /KnitPlot · Yoke designer/ }),
  ).toBeVisible();
  const original = await saved(page);
  await paint(page, original, "repeat", 1, 1);
  await expect
    .poll(
      async () => (await saved(page)).cells[1].filter((c) => c === 1).length,
    )
    .toBe(12);
  await second
    .getByRole("button", { name: "Paint with yarn colour 3" })
    .click();
  await paint(second, original, "repeat", 1, 2);
  await expect(second.locator(".yoke-designer [role=alert]")).toContainText(
    "another window changed it",
  );
  expect((await saved(page)).cells[1].filter((c) => c === 2).length).toBe(0);
});

test("yoke draft download roundtrips through the validated file importer", async ({
  page,
}) => {
  const original = await saved(page);
  await paint(page, original, "repeat", 1, 1);
  await expect.poll(async () => (await saved(page)).cells[1][1]).toBe(1);
  const expected = await saved(page);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download yoke draft", exact: true })
    .click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  expect(JSON.parse(buffer.toString("utf8"))).toEqual(expected);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await saved(page)).cells[1][1]).toBe(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: "test.knitplot-yoke",
    mimeType: "application/json",
    buffer,
  });
  await expect.poll(async () => (await saved(page)).cells[1][1]).toBe(1);
  expect(await saved(page)).toEqual(expected);
});

test("corrupt yoke drafts are not overwritten and normal chart storage is untouched", async ({
  page,
}) => {
  await page.evaluate((key) => {
    localStorage.setItem(key, "not-json");
    localStorage.setItem("colorwork-chart-v1", "separate chart workspace");
  }, KEY);
  await page.reload();
  await expect(page.locator(".yoke-designer [role=alert]")).toContainText(
    /could not be/,
  );
  await expect(
    page.getByRole("button", { name: "Download yoke draft", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
    "not-json",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("colorwork-chart-v1")),
  ).toBe("separate chart workspace");
});
