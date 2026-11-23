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
  await page.getByRole("button", { name: "Area", exact: true }).click();
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

test("drawing shortcuts preserve the selection mode and sample yarn without painting", async ({
  page,
}) => {
  const tool = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await tool("Select").click();
  await tool("Element").click();
  for (const [key, name] of [
    ["d", "Draw"],
    ["e", "Erase"],
    ["f", "Fill"],
    ["s", "Select"],
  ]) {
    await page.keyboard.press(key);
    await expect(tool(name)).toHaveClass("active");
  }
  const cells = page.locator(".chart-svg > g:first-child > rect");
  await cells.nth(0).click();
  await expect(page.locator(".chart-element-selection")).toHaveCount(1);
  await page.keyboard.press("d");
  await page.keyboard.press("i");
  await expect(
    page.getByText("Click a stitch to pick its yarn colour. Esc cancels."),
  ).toBeVisible();
  await cells.nth(1).click();
  await expect(tool("Draw")).toHaveClass("active");
  await expect(
    page.getByText("Click a stitch to pick its yarn colour. Esc cancels."),
  ).toHaveCount(0);
  await cells.nth(4).click();
  await expect
    .poll(async () => (await saved(page)).cells[0][4])
    .toBe(doc.palette[2].id);
  expect((await saved(page)).cells[0][1]).toBe(doc.palette[2].id);
});

test("keyboard can zoom, nudge five cells, erase yarn without cutting, and open Help", async ({
  page,
}) => {
  await expect(page.getByLabel("Chart zoom")).toContainText("100%");
  await page.keyboard.press("=");
  await page.keyboard.press("=");
  await page.keyboard.press("-");
  await expect(page.getByLabel("Chart zoom")).toContainText("150%");
  await page.keyboard.press("0");
  await expect(page.getByLabel("Chart zoom")).toContainText("100%");
  await select(page, 0, 19);
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Shift+ArrowRight");
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[0][5])
    .toBe("m1l");
  await page.keyboard.press("Backspace");
  await expect
    .poll(async () => (await saved(page)).cells[0][5])
    .toBe(doc.palette[0].id);
  expect((await saved(page)).stitchActions?.[0][5]).toBe("m1l");
  await page.keyboard.press("Control+v");
  await expect
    .poll(async () => (await saved(page)).cells[0][5])
    .toBe(doc.palette[1].id);
  await page.keyboard.press("?");
  const guide = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "Help and examples" }).click();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Close keyboard shortcuts" }).click();
  await page.getByRole("button", { name: "Knit mode", exact: true }).click();
  await page.keyboard.press("?");
  await expect(guide.getByText("Follow the chart")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Exit knit mode" }),
  ).toBeVisible();
});

test("Element copies a motif into another chart without covering its background gaps", async ({
  page,
}) => {
  const cells = page.locator(".chart-svg > g:first-child > rect");
  const selectButton = page.getByRole("button", {
    name: "Select",
    exact: true,
  });
  await selectButton.click();
  const mode = page.getByRole("group", { name: "Selection mode" });
  await expect(mode.getByRole("button", { name: "Area" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(mode).not.toBeVisible();
  await expect(selectButton).toBeFocused();
  await selectButton.click();
  await mode.getByRole("button", { name: "Element" }).click();
  await expect(mode).not.toBeVisible();
  await cells.nth(0).click();
  await expect(page.locator("path.chart-element-selection")).toHaveCount(1);
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "+ New chart", exact: true }).click();
  await page.getByRole("button", { name: "Blank chart", exact: true }).click();
  await page.getByRole("button", { name: "Use colour 2", exact: true }).click();
  await cells.nth(38).click(); // The gap at row 3, column 3.
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await cells.nth(19).click(); // Paste starts at row 2, column 2.
  await expect(mode).not.toBeVisible();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator("path.chart-element-selection")).toHaveCount(1);
  const target = () =>
    page.evaluate(() => {
      const workspace = JSON.parse(
        localStorage.getItem("colorwork-chart-v1")!,
      ) as WorkspaceSave;
      return workspace.tabs.find((tab) => tab.id === workspace.activeTabId)!
        .document;
    });
  await expect
    .poll(async () => (await target()).stitchActions?.[1][1])
    .toBe("m1l");
  const pasted = await target();
  expect(pasted.cells[1].slice(1, 3)).toEqual([
    doc.palette[1].id,
    doc.palette[2].id,
  ]);
  expect(pasted.cells[2].slice(1, 3)).toEqual([
    doc.palette[2].id,
    doc.palette[1].id,
  ]);
  expect(pasted.stitchCellColors?.[1][1]).toBe("#112233");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await target()).cells[1][1])
    .toBe(doc.palette[0].id);
  expect((await target()).cells[2][2]).toBe(doc.palette[1].id);
});

test("Pick background excludes a sampled shade when copying an element", async ({
  page,
}) => {
  const cells = page.locator(".chart-svg > g:first-child > rect");
  await page.getByRole("button", { name: "Add colour" }).click();
  const extraHex = await page.getByLabel("Change colour 4").inputValue();
  await cells.nth(19).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Element", exact: true }).click();
  await page
    .getByRole("button", { name: "Pick background", exact: true })
    .click();
  await cells.nth(19).click();
  await expect(
    page.getByRole("button", { name: "Reset background", exact: true }),
  ).toBeVisible();
  await cells.nth(0).click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page.getByRole("button", { name: "+ New chart", exact: true }).click();
  await page.getByRole("button", { name: "Blank chart", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(cells.nth(1)).toHaveAttribute("fill", doc.palette[2].hex);
  await expect(cells.nth(19)).toHaveAttribute("fill", doc.palette[0].hex);
  await expect(page.getByLabel("Change colour 4")).toHaveCount(0);
  const source = await saved(page);
  expect(source.palette.find(({ id }) => id === source.cells[1][1])?.hex).toBe(
    extraHex,
  );
});

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

for (const element of [false, true]) {
  test(`drag moves an ${element ? "element" : "area"} selection in one undo step`, async ({
    page,
  }) => {
    const cells = page.locator(".chart-svg > g:first-child > rect");
    if (element) {
      await page.getByRole("button", { name: "Select", exact: true }).click();
      await page.getByRole("button", { name: "Element", exact: true }).click();
      await cells.nth(0).click();
    } else await select(page, 0, 19);
    const a = (await cells.nth(0).boundingBox())!;
    const b = (await cells.nth(21).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await expect(
      page.locator(".chart-selection").locator(".."),
    ).toHaveAttribute("transform", /translate\(/);
    await page.mouse.up();
    await expect
      .poll(async () => (await saved(page)).stitchActions?.[1][3])
      .toBe("m1l");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await saved(page)).cells).toEqual(doc.cells);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect
      .poll(async () => (await saved(page)).stitchActions?.[1][3])
      .toBe("m1l");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await saved(page)).stitchActions?.[1][4])
      .toBe("m1l");
    await page.keyboard.press("Escape");
    await expect(page.locator(".chart-selection")).toHaveCount(0);
  });
}

test("clipboard, select-all and palette shortcuts leave text inputs alone", async ({
  page,
}) => {
  await select(page, 0, 19);
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+x");
  await expect
    .poll(async () => (await saved(page)).cells[0][0])
    .toBe(doc.palette[0].id);
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(async () => (await saved(page)).stitchActions?.[0][0])
    .toBe("m1l");
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator("rect.chart-selection")).toHaveAttribute(
    "height",
    String(doc.height),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Use colour 1", exact: true }).click();
  await page.keyboard.press("]");
  await expect(
    page
      .locator(".palette-row.selected")
      .getByRole("button", { name: "Use colour 2" }),
  ).toBeVisible();
  const name = page.getByRole("textbox", { name: "Chart name" });
  await name.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.locator(".chart-selection")).toHaveCount(0);
  await expect
    .poll(() =>
      name.evaluate(
        (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
      ),
    )
    .toBe((await name.inputValue()).length);
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
