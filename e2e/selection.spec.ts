import { test, expect, type Page } from "@playwright/test";
import {
  cloneDocument,
  defaultDocument,
  createStitchActions,
  copyStitchCellColors,
} from "../lib/chart";
import {
  newChartTab,
  workspaceSave,
  type WorkspaceSave,
} from "../lib/workspace";

const doc = cloneDocument(defaultDocument);
doc.cells = doc.cells.map((row) => row.map(() => doc.palette[0].id));
doc.cells[0][0] = doc.palette[1].id;
doc.cells[0][1] = doc.palette[2].id;
doc.cells[1][0] = doc.palette[2].id;
doc.stitchActions = createStitchActions(doc.width, doc.height);
doc.stitchActions[0][0] = "m1l";
doc.stitchActions[1][0] = "purl";
doc.stitchCellColors = copyStitchCellColors(doc);
doc.stitchCellColors[0][0] = "#112233";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (workspace) => {
      localStorage.setItem("colorwork-chart-v1", JSON.stringify(workspace));
      localStorage.setItem("knitplot-tutorial-v1", "seen");
    },
    workspaceSave([newChartTab(doc, "selection")], "selection"),
  );
  await page.goto("/");
});
async function select(page: Page, from: number, to: number) {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const cells = page.locator(".chart-svg > g:first-child > rect");
  const start = (await cells.nth(from).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  // Selecting reveals more toolbar controls and may move the chart vertically.
  await expect(page.locator(".chart-selection")).toHaveCount(1);
  const end = (await cells.nth(to).boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
}
const saved = (page: Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("colorwork-chart-v1")!) as WorkspaceSave)
        .tabs[0].document,
  );

test("selection move, cut, paste and history preserve all stitch layers", async ({
  page,
}) => {
  await select(page, 0, 19);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page
    .getByRole("button", { name: "Move selection right", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).cells[0].slice(0, 3))
    .toEqual([doc.palette[0].id, doc.palette[1].id, doc.palette[2].id]);
  expect((await saved(page)).stitchActions![0][1]).toBe("m1l");
  expect((await saved(page)).stitchCellColors![0][1]).toBe("#112233");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await saved(page)).cells).toEqual(doc.cells);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).stitchActions)
    .toBeUndefined();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[0][1])
    .toBe("m1l");
  expect((await saved(page)).stitchCellColors![0][1]).toBe("#112233");
});

test("selection flips and rectangular rotation preserve stitch meanings and undo", async ({
  page,
}) => {
  await select(page, 0, 20);
  await page
    .getByRole("button", {
      name: "Mirror selection left to right",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[0][2])
    .toBe("m1l");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Flip selection upside down", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[1][0])
    .toBe("m1l");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Rotate selection 90 degrees clockwise",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[0][1])
    .toBe("m1l");
  expect((await saved(page)).stitchActions![0][0]).toBe("purl");
  expect((await saved(page)).stitchCellColors![0][1]).toBe("#112233");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await saved(page)).cells).toEqual(doc.cells);
});

test("selection fill accepts reversed drags and keeps symbols", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  await select(page, 19, 0);
  await page
    .getByRole("button", { name: "Fill selection", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).cells[0][0])
    .toBe(doc.palette[2].id);
  expect((await saved(page)).stitchActions![0][0]).toBe("m1l");
  expect((await saved(page)).stitchCellColors![0][0]).toBeNull();
  await expect(
    page.getByRole("button", { name: "Fill selection", exact: true }),
  ).toHaveCount(0);
});
