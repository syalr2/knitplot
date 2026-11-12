import { test, expect, type Page } from "@playwright/test";
import type { YokeProject } from "../lib/yoke-project";
import { yokeChart } from "../lib/yoke-chart";
import { yokeGeometry, type YokeView } from "../lib/yoke-layout";
import { planYokeShortRows } from "../lib/yoke-short-rows";
import { shortRowCells } from "../lib/yoke-short-row-layout";
import { yokeCanvasViewport } from "../lib/yoke-canvas-view";
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
  if (view === "chart") {
    const chart = yokeChart(project);
    const chartRow = project.cells.length - 1 - row;
    const chartColumn = chart.maps[row][column];
    await page
      .locator(".chart-svg > g:first-child > rect")
      .nth(chartRow * chart.document.width + chartColumn)
      .click();
    return;
  }
  const canvas = page.getByRole("img", { name: /drawing canvas/ });
  await canvas.locator("..").scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const g = yokeGeometry(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    view,
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  const angle = g.startAngle + ((column + 0.5) / g.shownCounts[row]) * g.arc;
  const radius = g.inner + (row + 0.5) * g.radialHeight;
  const x = g.cx + Math.cos(angle) * radius;
  const y = g.cy + Math.sin(angle) * radius;
  const viewport = yokeCanvasViewport(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    view,
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  const position = {
    x: ((x - viewport.x) / viewport.width) * box.width,
    y: ((y - viewport.y) / viewport.height) * box.height,
  };
  await canvas.evaluate((element, point) => {
    const parent = element.parentElement!;
    parent.scrollLeft = point.x - parent.clientWidth / 2;
    parent.scrollTop = point.y - parent.clientHeight / 2;
  }, position);
  const scrolled = (await canvas.boundingBox())!;
  await page.mouse.click(scrolled.x + position.x, scrolled.y + position.y);
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

test("short-row turns validate, save, undo and reload without changing chart stitches", async ({
  page,
}) => {
  const original = await saved(page);
  const panel = page.locator(".yoke-short-rows");
  await expect(panel).toContainText("3 pairs");
  await expect(panel.getByRole("link")).toHaveCount(0);
  await expect(panel.locator(".yoke-short-row-instructions")).toHaveCount(0);
  await expect(
    panel.getByRole("img", { name: /^Short-row turn map/ }),
  ).toBeVisible();
  await page.getByLabel("Pair 1: stitches each side").fill("18");
  await panel.getByRole("button", { name: "Save short-row setup" }).click();
  await expect
    .poll(async () => (await saved(page)).shortRows?.distances)
    .toEqual([18, 30, 34]);
  expect((await saved(page)).cells).toEqual(original.cells);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Pair 1: stitches each side")).toHaveValue("25");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByLabel("Pair 1: stitches each side")).toHaveValue("18");
  await page.reload();
  await expect(page.getByLabel("Pair 1: stitches each side")).toHaveValue("18");
  await page.getByLabel("Pair 2: stitches each side").fill("18");
  await expect(panel.getByRole("alert")).toContainText(
    "all increasing or all decreasing",
  );
  await expect(
    panel.getByRole("button", { name: "Save short-row setup" }),
  ).toBeDisabled();
  expect((await saved(page)).shortRows?.distances).toEqual([18, 30, 34]);
  await panel.getByRole("button", { name: "Use suggested turns" }).click();
  await expect(page.getByLabel("Pair 1: stitches each side")).toHaveValue("25");
});

test("narrowing turn edits survive reload and appear inside the whole-yoke neckline", async ({
  page,
}) => {
  const original = await saved(page);
  for (const [i, value] of [34, 30, 25].entries())
    await page
      .getByLabel(`Pair ${i + 1}: stitches each side`)
      .fill(String(value));
  await page.getByRole("button", { name: "Save short-row setup" }).click();
  await expect
    .poll(async () => (await saved(page)).shortRows?.distances)
    .toEqual([34, 30, 25]);
  await page.reload();
  await expect(page.getByLabel("Pair 3: stitches each side")).toHaveValue("25");
  await expect(
    page.getByRole("img", { name: /^Short-row turn map/ }),
  ).toHaveAttribute("aria-label", /narrowing/);
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  const project = await saved(page);
  const g = yokeGeometry(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    "whole",
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  const cell = shortRowCells(
    planYokeShortRows(project.measurements, project.shortRows),
    g.inner,
    g.radialHeight,
  )[0];
  const angle = (cell.start + cell.end) / 2;
  const radius = (cell.inner + cell.outer) / 2;
  const x = Math.round(g.cx + Math.cos(angle) * radius),
    y = Math.round(g.cy + Math.sin(angle) * radius);
  const viewport = yokeCanvasViewport(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    "whole",
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate(
          (canvas, point) =>
            (canvas as HTMLCanvasElement)
              .getContext("2d")!
              .getImageData(
                Math.round(point.x * (canvas as HTMLCanvasElement).width),
                Math.round(point.y * (canvas as HTMLCanvasElement).height),
                1,
                1,
              ).data[3],
          {
            x: (x - viewport.x) / viewport.width,
            y: (y - viewport.y) / viewport.height,
          },
        ),
    )
    .toBe(255);
  expect(project.cells).toEqual(original.cells);
});

test("a height outside the suggested spread still allows custom turn entry", async ({
  page,
}) => {
  await page.getByLabel("Extra back-neck height", { exact: true }).fill("4");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply plan to drawing", exact: true })
    .click();
  await expect(page.getByLabel("Pair 6: stitches each side")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use suggested turns" }),
  ).toBeDisabled();
  for (const [i, value] of [10, 14, 18, 22, 26, 30].entries())
    await page
      .getByLabel(`Pair ${i + 1}: stitches each side`)
      .fill(String(value));
  await page.getByRole("button", { name: "Save short-row setup" }).click();
  await expect
    .poll(async () => (await saved(page)).shortRows?.distances)
    .toEqual([10, 14, 18, 22, 26, 30]);
});

test("finished measurement mode preserves size, avoids double ease and survives reload", async ({
  page,
}) => {
  const original = await saved(page);
  await page.getByLabel("Measurement input", { exact: false }).check();
  await expect(
    page.getByLabel("Finished body circumference", { exact: false }),
  ).toHaveValue("106");
  await expect(
    page.getByLabel("Finished upper-sleeve circumference", { exact: false }),
  ).toHaveValue("36");
  await expect(
    page.getByRole("spinbutton", { name: /^Body ease/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply plan to drawing", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).measurements.measurementMode)
    .toBe("finished");
  expect((await saved(page)).cells).toEqual(original.cells);
  await page.reload();
  await expect(
    page.getByLabel("Measurement input", { exact: false }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Finished body circumference", { exact: false }),
  ).toHaveValue("106");
  await page.getByLabel("Measurement input", { exact: false }).uncheck();
  await expect(
    page.getByLabel("Body chest / bust", { exact: false }),
  ).toHaveValue("96");
  await expect(
    page.getByRole("spinbutton", { name: /^Body ease/ }),
  ).toHaveValue("10");
});

test("measurement unit switches convert and restore values without changing the saved plan", async ({
  page,
}) => {
  const original = await saved(page);
  const units = page.getByRole("switch", {
    name: "Measurement units",
    exact: true,
  });
  await units.check();
  await expect(units).toBeChecked();
  expect(
    Number(
      await page.getByLabel("Body chest / bust", { exact: false }).inputValue(),
    ),
  ).toBeCloseTo(96 / 2.54, 2);
  await units.uncheck();
  expect(
    Number(
      await page.getByLabel("Body chest / bust", { exact: false }).inputValue(),
    ),
  ).toBeCloseTo(96, 2);
  expect(await saved(page)).toEqual(original);
  await page.getByLabel("Body chest / bust", { exact: false }).fill("");
  await units.click();
  await expect(units).not.toBeChecked();
  await expect(
    page.getByLabel("Body chest / bust", { exact: false }),
  ).toHaveValue("");
});

test("diagram points focus the matching fields and field focus highlights the guide", async ({
  page,
}) => {
  const planner = page.locator("section.yoke-panel").filter({
    has: page.getByRole("heading", { name: "Plan the yoke", exact: true }),
  });
  await expect(planner.locator(".yoke-measurement-guide")).toBeVisible();
  await expect(
    page.locator(".yoke-drawing .yoke-measurement-guide"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: /^Body measurement diagram/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /^Sweater measurement diagram/ }),
  ).toBeVisible();
  await page.getByLabel("Full-round yoke length", { exact: false }).focus();
  await expect(
    page.locator('.measurement-point[data-field="depth"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Sweater diagram point 5", exact: true })
    .click();
  await expect(
    page.getByLabel("Each underarm width", { exact: false }),
  ).toBeFocused();
  await expect(page.locator(".measurement-guide-selection")).toContainText(
    "cast on at one underarm",
  );
  await expect(planner.locator(".measurement-detail image")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Sweater diagram point 6", exact: true })
    .click();
  await expect(
    page.getByLabel("Extra back-neck height", { exact: true }),
  ).toBeFocused();
  await expect(
    page.locator('.measurement-point[data-field="backRise"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Measurement input", { exact: false }).check();
  await expect(
    page.getByRole("button", { name: "Body diagram point 1", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page
    .getByRole("button", { name: "Sweater diagram point 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Finished body circumference", { exact: false }),
  ).toBeFocused();
});

test("unfinished numbers are not replaced with zero when changing measurement mode", async ({
  page,
}) => {
  const original = await saved(page);
  await page.getByLabel("Body chest / bust", { exact: false }).fill("");
  await page.getByLabel("Measurement input", { exact: false }).click();
  await expect(
    page.getByLabel("Measurement input", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Body chest / bust", { exact: false }),
  ).toHaveValue("");
  expect(await saved(page)).toEqual(original);
});

test("a failed recalculation cannot leave fresh targets paired with a stale schedule", async ({
  page,
}) => {
  const original = await saved(page);
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calculated targets" }),
  ).toBeVisible();
  await page.getByLabel("Finished neck opening", { exact: false }).fill("12");
  await page.getByLabel("Full-round yoke length", { exact: false }).fill("1.8");
  await page.getByLabel("Body chest / bust", { exact: false }).fill("160");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(page.locator(".yoke-designer [role=alert]")).toContainText(
    "too few rounds",
  );
  await expect(
    page.getByRole("button", { name: "Apply plan to drawing" }),
  ).toHaveCount(0);
  expect(await saved(page)).toEqual(original);
});

test("large rounding changes require approval and repeat alternatives only change the draft form", async ({
  page,
}) => {
  const original = await saved(page);
  await page.getByLabel("Finished neck opening", { exact: false }).fill("34");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Review adjusted measurements" }),
  ).toBeVisible();
  const apply = page.getByRole("button", { name: "Apply plan to drawing" });
  await expect(apply).toBeDisabled();
  await page
    .getByLabel("Use these adjusted measurements", { exact: true })
    .check();
  await expect(apply).toBeEnabled();
  await page
    .getByRole("button", { name: /^Try \d+ repeats/ })
    .first()
    .click();
  await expect(apply).toBeDisabled();
  expect(await saved(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(
    page.getByLabel("Use these adjusted measurements", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Apply plan to drawing" }).click();
  await expect.poll(async () => (await saved(page)).measurements.neck).toBe(34);
});

test("leaving through Chart maker flushes an edit before its debounce timer fires", async ({
  page,
}) => {
  const original = await saved(page);
  const time = new Date("2026-11-10T12:00:00Z");
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  await paint(page, original, "repeat", 2, 1);
  expect((await saved(page)).cells[2].filter((c) => c === 1)).toHaveLength(0);
  await page.getByRole("link", { name: "Chart maker", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(
      async () => (await saved(page)).cells[2].filter((c) => c === 1).length,
    )
    .toBe(original.measurements.repeats);
});

test("eight editable increase rounds render real M1 labels and no-stitch placeholders", async ({
  page,
}) => {
  await page
    .getByLabel("Increase scheduling", { exact: false })
    .selectOption("grouped");
  await page
    .getByRole("spinbutton", { name: /^Number of increase rounds/ })
    .fill("8");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: /^Increase \d+ round$/ }),
  ).toHaveCount(8);
  await page
    .getByLabel("Increase 1 stitch type", { exact: true })
    .selectOption("m1r");
  await page
    .getByRole("button", { name: "Apply plan to drawing", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).events[0].stitch)
    .toBe("m1r");
  await page
    .getByRole("button", { name: "Standard chart", exact: true })
    .click();
  await expect(page.locator(".chart-svg")).toBeVisible();
  await expect(page.locator(".chart-no-stitch").first()).toBeVisible();
  await expect(
    page
      .locator(".chart-action-symbols text")
      .filter({ hasText: "M1R" })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".chart-row-numbers")).toBeVisible();
});

test("a failed draft save lets the user cancel leaving and keep their drawing", async ({
  page,
}) => {
  const original = await saved(page);
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key)
        throw new DOMException("Storage full", "QuotaExceededError");
      return originalSetItem.call(this, name, value);
    };
  }, KEY);
  await paint(page, original, "repeat", 2, 1);
  const dialog = page.waitForEvent("dialog");
  const click = page
    .getByRole("link", { name: "Chart maker", exact: true })
    .click();
  await (await dialog).dismiss();
  await click;
  await expect(page).toHaveURL(/\/yoke$/);
  await expect(page.locator(".yoke-designer [role=alert]")).toContainText(
    "could not be saved",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download yoke draft", exact: true })
    .click();
  const path = await (await download).path();
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile(path!, "utf8")) as YokeProject;
  expect(exported.cells[2].filter((c) => c === 1)).toHaveLength(
    original.measurements.repeats,
  );
  expect(await saved(page)).toEqual(original);
});

test("automatic shaping uses the optional checkpoint and preserves it on reload", async ({
  page,
}) => {
  await expect(
    page.getByLabel("Increase scheduling", { exact: false }),
  ).toHaveValue("automatic");
  await expect(
    page.getByRole("spinbutton", { name: /^Number of increase rounds/ }),
  ).toHaveCount(0);
  const original = await saved(page);
  expect(original.events).toHaveLength(9);
  let before = original.cells[0].length;
  for (const event of original.events) {
    expect(event.count - before).toBeLessThanOrEqual(
      Math.max(original.measurements.repeats, before * 0.25),
    );
    before = event.count;
  }
  await page
    .getByLabel("Finished shoulder-level circumference", { exact: false })
    .fill("120");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(page.locator(".yoke-designer [role=alert]")).toContainText(
    "both shoulder checkpoint",
  );
  await page
    .getByLabel("Length to shoulder checkpoint", { exact: false })
    .fill("9");
  await page
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await expect(page.locator(".yoke-candidate")).toContainText(
    "240 stitches on round 26",
  );
  expect((await saved(page)).measurements).toEqual(original.measurements);
  await page
    .getByRole("button", { name: "Apply plan to drawing", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).cells[25].length).toBe(240);
  await page.reload();
  await expect(
    page.getByLabel("Finished shoulder-level circumference", { exact: false }),
  ).toHaveValue("120");
  expect((await saved(page)).cells[25].length).toBe(240);
});

test("front and back half views paint their own matching whole-yoke stitches", async ({
  page,
}) => {
  const original = await saved(page);
  await page.getByLabel("Edit all repeats").uncheck();
  await page.getByRole("button", { name: "Half yoke", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Front half drawing canvas" }),
  ).toBeVisible();
  await paint(page, original, "front", 1, 2);
  const frontOffset = Math.floor(original.cells[1].length / 4);
  await expect
    .poll(async () => (await saved(page)).cells[1][frontOffset + 2])
    .toBe(1);
  await page.getByLabel("Half-yoke side").selectOption("back");
  await expect(
    page.getByRole("img", { name: "Back half drawing canvas" }),
  ).toBeVisible();
  await paint(page, original, "back", 1, 2);
  const backOffset = Math.floor(original.cells[1].length * 0.75);
  await expect
    .poll(
      async () =>
        (await saved(page)).cells[1][
          (backOffset + 2) % original.cells[1].length
        ],
    )
    .toBe(1);
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

test("undoing an imported larger palette keeps a visible usable paint colour", async ({
  page,
}) => {
  const original = await saved(page);
  const imported = {
    ...original,
    palette: [
      "#f2eadf",
      "#334c44",
      "#c86f52",
      "#111111",
      "#223344",
      "#556677",
      "#8899aa",
      "#bbccdd",
    ],
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "large-palette.knitplot-yoke",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page
    .getByRole("button", { name: "Paint with yarn colour 8", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Paint with yarn colour 3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await paint(page, original, "repeat", 2, 1);
  await expect
    .poll(
      async () => (await saved(page)).cells[2].filter((c) => c === 2).length,
    )
    .toBe(original.measurements.repeats);
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
