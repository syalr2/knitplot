import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChartDocument } from "../lib/chart";
import { defaultDocument } from "../lib/chart";
import { readProject } from "../lib/project-file";
import { readChartDocument } from "../lib/chart-schema";
import { newChartTab, workspaceSave, STORAGE_KEY } from "../lib/workspace";
import { createYokeProject } from "../lib/yoke-project";
import {
  defaultYokeMeasurements as m,
  calculateYokeTargets,
  suggestYokeSchedule,
} from "../lib/yoke-plan";
import { yokeDocument } from "../lib/yoke-document";
import { yokeProgramFromProject } from "../lib/yoke-program-from-project";
import { withYokeProgram } from "../lib/yoke-program-state";
import { reviseYokeStitches } from "../lib/yoke-stitch-revision";
import type { YokeStitchProgram } from "../lib/yoke-stitch-program";
import { stringifyKnitplot } from "../lib/yoke-program-wire";
import { asymmetricYoke, makeYokeFixture } from "../lib/yoke-test-fixtures";

test.setTimeout(90_000);
const plain = () =>
  createYokeProject(m, suggestYokeSchedule(calculateYokeTargets(m), m.repeats));

for (const type of ["regular", "yoke"] as const) {
  test(`${type} preview sits directly below the editor even when the sidebar is taller`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const input = { ...m, depth: 50 / m.gaugeRows, backRise: 0 };
    const document =
      type === "regular"
        ? {
            ...defaultDocument,
            width: 30,
            height: 6,
            guides: {
              ...defaultDocument.guides,
              repeatWidth: 30,
              repeatHeight: 6,
            },
            cells: Array.from({ length: 6 }, () =>
              Array<string>(30).fill("background"),
            ),
          }
        : yokeDocument(
            createYokeProject(
              input,
              suggestYokeSchedule(calculateYokeTargets(input), input.repeats),
            ),
          );
    const tab = newChartTab(readChartDocument(document), "layout-chart");
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
        localStorage.setItem("knitplot-tutorial-v1", "seen");
      },
      {
        key: STORAGE_KEY,
        value: stringifyKnitplot(workspaceSave([tab], tab.id)),
      },
    );
    await page.goto("/");
    const editor = page.locator(".workspace .editor");
    const preview = page.locator(".workspace .preview");
    const sidebar = page.locator(".workspace .sidebar");
    await expect(editor).toBeVisible();
    await expect(preview).toBeVisible();
    const staleNotice = preview.getByText("Preview needs a refresh.", {
      exact: true,
    });
    await expect(staleNotice).toBeHidden();
    await page
      .getByRole("textbox", { name: "Chart name" })
      .fill("Renamed chart");
    await expect(staleNotice).toBeHidden();
    const e = (await editor.boundingBox())!;
    const p = (await preview.boundingBox())!;
    const s = (await sidebar.boundingBox())!;
    expect(s.height).toBeGreaterThan(e.height);
    expect(p.y - (e.y + e.height)).toBeCloseTo(18, 0);
  });
}

async function openPreview(page: Page, document: ChartDocument) {
  await page.route("**/images/yoke/photo-sweater-front.webp", (route) =>
    route.fulfill({
      path: resolve("public/images/yoke/photo-sweater-front.webp"),
    }),
  );
  await page.route("**/textures/merino-relief.png", (route) =>
    route.fulfill({ path: resolve("public/textures/merino-relief.png") }),
  );
  const saved = stringifyKnitplot(
    workspaceSave([newChartTab(document, "sample-yoke")], "sample-yoke"),
  );
  await page.addInitScript(
    ({ key, saved }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, saved);
      localStorage.setItem("knitplot-tutorial-v1", "seen");
    },
    { key: STORAGE_KEY, saved },
  );
  await page.goto("/");
  const panel = page.locator(".preview.panel");
  await expect(panel).toHaveAttribute("open", "");
  const started = Date.now();
  const canvas = panel.getByRole("img", {
    name: "Photographic knitted fabric preview",
    exact: true,
  });
  await expect(canvas).toHaveAttribute(
    "data-preview-state",
    /^(ready|error)$/,
    {
      timeout: 45_000,
    },
  );
  if ((await canvas.getAttribute("data-preview-state")) === "error")
    throw new Error(await panel.getByRole("alert").innerText());
  console.log(`First knitted preview: ${Date.now() - started} ms`);
  expect(
    await canvas.evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 16)
        if (pixels[i] < 235 || pixels[i + 1] < 235 || pixels[i + 2] < 235)
          colored++;
      return colored;
    }),
  ).toBeGreaterThan(500);
  return { panel, canvas };
}

test("whole yoke preview starts open, refreshes, downloads and can collapse", async ({
  page,
}) => {
  const { canvas, panel } = await openPreview(
    page,
    yokeDocument(plain(), "Plain yoke"),
  );
  expect(
    await canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d")!;
      const { width, height } = canvas;
      const center = context.getImageData(width / 2, height / 2, 1, 1).data;
      const occupiedSectors = Array.from({ length: 8 }, (_, sector) => {
        const angle = (sector * Math.PI) / 4;
        const x = width * (0.5 + 0.3 * Math.cos(angle));
        const y = height * (0.5 + 0.3 * Math.sin(angle));
        const data = context.getImageData(x - 5, y - 5, 10, 10).data;
        return data.some((value, index) => index % 4 !== 3 && value < 235);
      });
      return (
        Math.abs(width - height) < width * 0.05 &&
        center[0] === 255 &&
        center[1] === 255 &&
        center[2] === 255 &&
        occupiedSectors.every(Boolean)
      );
    }),
  ).toBe(true);
  await canvas.screenshot({ path: "/tmp/knitplot-preview-plain-yoke.png" });
  const image = () =>
    canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  const original = await image();
  const stale = panel.getByText("Preview needs a refresh.", { exact: true });
  await page.locator(".chart-svg > g:first-child > rect").nth(2).click();
  await expect(stale).toBeVisible();
  expect(await image()).toBe(original);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(stale).toBeHidden();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(stale).toBeVisible();
  await panel
    .getByRole("button", { name: "Refresh preview", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
  await expect.poll(async () => (await image()) !== original).toBe(true);
  await expect(stale).toBeHidden();
  await page.getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download knitted preview", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("plain-yoke.knitted.png");
  await panel.locator("summary").click();
  await expect(panel.locator("canvas")).toHaveCount(0);
  await panel.locator("summary").click();
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
});

test("unavailable sweater downloads direct users to another preview view", async ({
  page,
}) => {
  const input = { ...m, depth: 40, backRise: 0 };
  const document = yokeDocument(
    createYokeProject(
      input,
      suggestYokeSchedule(calculateYokeTargets(input), input.repeats),
    ),
    "Deep yoke",
  );
  const { panel, canvas } = await openPreview(page, document);
  const view = panel.getByRole("combobox", { name: "View", exact: true });
  await view.selectOption("sweater");
  await expect(
    panel.getByText("This sweater template doesn’t fit", { exact: false }),
  ).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPreview = page.getByRole("menuitem", {
    name: "Download knitted preview",
    exact: true,
  });
  await downloadPreview.click();
  await expect(
    page.getByText(
      "Choose an available view in Knitted up before downloading the preview.",
    ),
  ).toBeVisible();
  await view.selectOption("front");
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
  if (!(await downloadPreview.isVisible()))
    await page.getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await downloadPreview.click();
  expect((await download).suggestedFilename()).toBe("deep-yoke.knitted.png");
});

test("sweater view is front-only, and the back half remains available separately", async ({
  page,
}) => {
  const sample = asymmetricYoke;
  const { panel, canvas } = await openPreview(page, sample.document);
  const view = panel.getByRole("combobox", { name: "View", exact: true });
  await view.selectOption("sweater");
  await expect(
    panel.getByRole("combobox", { name: "Sweater side" }),
  ).toHaveCount(0);
  const stale = panel.getByText("Preview needs a refresh.", { exact: true });
  await expect(stale).toBeHidden();
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
  const front = await canvas.evaluate((el) => {
    const image = el as HTMLCanvasElement;
    const ctx = image.getContext("2d")!;
    const sample = ctx.getImageData(
      image.width * 0.48,
      image.height * 0.67,
      25,
      25,
    ).data;
    const texture = new Set<number>();
    for (let i = 0; i < sample.length; i += 4) texture.add(sample[i]);
    return {
      png: image.toDataURL(),
      aspect: image.width / image.height,
      cornerAlpha: ctx.getImageData(0, 0, 1, 1).data[3],
      texture: texture.size,
    };
  });
  expect(front.aspect).toBeGreaterThan(1.15);
  expect(front.cornerAlpha).toBe(0);
  expect(front.texture).toBeGreaterThan(10);
  await canvas.screenshot({ path: "/tmp/knitplot-sweater-front.png" });
  await view.selectOption("back");
  await expect(stale).toBeHidden();
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
  await expect
    .poll(
      async () =>
        (await canvas.evaluate((el) =>
          (el as HTMLCanvasElement).toDataURL(),
        )) !== front.png,
    )
    .toBe(true);
  await view.selectOption("sweater");
  await expect
    .poll(
      async () =>
        (await canvas.evaluate((el) =>
          (el as HTMLCanvasElement).toDataURL(),
        )) === front.png,
    )
    .toBe(true);
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await page.locator(".chart-svg > g:first-child > rect").nth(2).click();
  await expect(stale).toBeVisible();
  await panel.getByRole("button", { name: "Refresh preview" }).click();
  await expect(canvas).toHaveAttribute("data-preview-state", "ready");
  await expect(stale).toBeHidden();
  await page.getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: "Download knitted preview" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "asymmetric-test-yoke.knitted.png",
  );
});

for (const [gaugeStitches, gaugeRows] of [
  [14, 20],
  [22, 30],
]) {
  test(`sweater view renders at ${gaugeStitches} stitches per 10 cm`, async ({
    page,
  }) => {
    const document = yokeDocument(
      makeYokeFixture({ gaugeStitches, gaugeRows, backRise: 0, repeats: 8 }),
    );
    const { panel, canvas } = await openPreview(page, document);
    await panel
      .getByRole("combobox", { name: "View", exact: true })
      .selectOption("sweater");
    await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
      timeout: 45_000,
    });
    const box = (await canvas.boundingBox())!;
    expect(box.width / box.height).toBeGreaterThan(1.15);
  });
}

test("photographic preview accepts unequal repeats, real shaping and purls", async ({
  page,
}) => {
  const project = plain();
  project.cells = project.cells.map((row, r) =>
    row.map((_, col) =>
      r > 8 && (col * 2 + r) % 19 < 5
        ? 1 + (Math.floor(col / (row.length / m.repeats)) % 2)
        : 0,
    ),
  );
  const program = yokeProgramFromProject(project),
    round = program.rounds.length - 7;
  const next = reviseYokeStitches(program, [
    {
      round,
      section: 0,
      operation: program.rounds[round][0][4].id,
      action: "ssk",
    },
    {
      round,
      section: 1,
      operation: program.rounds[round][1][4].id,
      action: "kfb",
    },
    {
      round,
      section: 2,
      operation: program.rounds[round][2][4].id,
      action: "purl",
    },
  ]);
  const { panel, canvas } = await openPreview(
    page,
    readChartDocument(
      yokeDocument(withYokeProgram(project, next), "Unequal repeats"),
    ),
  );
  await canvas.screenshot({ path: "/tmp/knitplot-preview-unequal-yoke.png" });
  const view = panel.getByRole("combobox", { name: "View", exact: true });
  expect((await view.boundingBox())!.width).toBeGreaterThanOrEqual(120);
  const image = () =>
    canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  const seen = new Set([await image()]);
  let workers = 0;
  page.on("worker", () => workers++);
  for (const option of ["front", "back", "repeat"]) {
    const started = Date.now();
    await view.selectOption(option);
    await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
      timeout: 45_000,
    });
    const current = await image();
    expect(seen.has(current)).toBe(false);
    seen.add(current);
    console.log(`${option} preview: ${Date.now() - started} ms`);
    if (option === "back")
      await canvas.screenshot({ path: "/tmp/knitplot-preview-back-yoke.png" });
  }
  const firstRepeat = await image();
  const repeat = panel.getByRole("combobox", {
    name: "Preview repeat",
    exact: true,
  });
  await repeat.selectOption({ value: "1" });
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 45_000,
  });
  await expect
    .poll(async () => !seen.has(await image()), { timeout: 45_000 })
    .toBe(true);
  const workerCount = workers;
  const started = Date.now();
  await repeat.selectOption({ value: "0" });
  await expect.poll(async () => (await image()) === firstRepeat).toBe(true);
  expect(workers).toBe(workerCount);
  console.log(`Cached repeat preview: ${Date.now() - started} ms`);
});

test("local Rosie chart comparison keeps the supplied motif and increases", async ({
  page,
}) => {
  const fixture = process.env.KNITPLOT_ROSIE_FIXTURE;
  test.skip(
    !fixture,
    "Optional user-supplied comparison chart; not distributed with KnitPlot.",
  );
  const source = readProject(JSON.parse(await readFile(fixture!, "utf8")));
  const repeat = source
    .stitchActions!.map((row, r) =>
      row.flatMap((action, c) =>
        action === "no-stitch"
          ? []
          : [
              {
                action,
                color: source.palette.findIndex(
                  (yarn) => yarn.id === source.cells[r][c],
                ),
              },
            ],
      ),
    )
    .reverse();
  const neck = repeat[0].filter(
    (op) => op.action !== "m1l" && op.action !== "m1r",
  ).length;
  const repeats = 6;
  const measurements = {
    ...m,
    repeats,
    backRise: 0,
    neck: (neck * repeats * source.gaugeMeasure) / source.gaugeStitches,
    depth: (source.height * source.gaugeMeasure) / source.gaugeRows,
    gaugeStitches: source.gaugeStitches,
    gaugeRows: source.gaugeRows,
    gaugeMeasure: source.gaugeMeasure,
    unit: source.gaugeUnit,
  };
  const program: YokeStitchProgram = {
    revision: 0,
    startingCounts: Array<number>(repeats).fill(neck),
    rounds: repeat.map((ops, r) =>
      Array.from({ length: repeats }, (_, s) =>
        ops.map((op, c) => ({ ...op, id: `r${r}.${s}.${c}` })),
      ),
    ),
  };
  const project = withYokeProgram(
    {
      format: "knitplot-yoke",
      version: 1,
      measurements,
      events: [],
      palette: source.palette.map((color) => color.hex),
      cells: [],
    },
    program,
  );
  const { canvas } = await openPreview(
    page,
    readChartDocument(yokeDocument(project, "Rosie · local comparison")),
  );
  await canvas.screenshot({ path: "/tmp/knitplot-preview-rosie-yoke.png" });
});
