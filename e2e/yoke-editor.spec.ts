import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import type { WorkspaceSave } from "../lib/workspace";
import { newChartTab, readWorkspace, workspaceSave } from "../lib/workspace";
import { readProject } from "../lib/project-file";
import { readChartDocument } from "../lib/chart-schema";
import { yokeGeometry, type YokeView } from "../lib/yoke-layout";
import { yokeCanvasViewport } from "../lib/yoke-canvas-view";
import type { YokeProject } from "../lib/yoke-project";
import { restoreYokeHistoryDocument } from "../lib/yoke-history";
import { presentYokePoint } from "../lib/yoke-view-transform";
import { asymmetricYoke, wideYoke } from "../lib/yoke-test-fixtures";
import { paintYoke } from "../lib/yoke-project";
import { yokeDocument } from "../lib/yoke-document";
import { yokeKnitModel, yokeKnitPages } from "../lib/yoke-knit";
const key = "colorwork-chart-v1";
test.setTimeout(90_000);
const saved = async (page: Page) =>
  readWorkspace(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!) as WorkspaceSave,
      key,
    ),
  ).workspace;
const active = async (page: Page) => {
  const state = await saved(page);
  return state.tabs.find((tab) => tab.id === state.activeTabId)!;
};
async function previewPlan(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("knitplot-tutorial-v1", "seen"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Circular yoke", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create circular yoke" });
  await dialog
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Preview yoke", exact: true })
    .click();
  return dialog;
}
async function create(page: Page) {
  const dialog = await previewPlan(page);
  await dialog
    .getByRole("button", { name: "Create yoke", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit shaping", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => !!(await active(page)).document.yoke)
    .toBe(true);
}

test("the planning preview fits on a small screen and can zoom while editing short rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 });
  const dialog = await previewPlan(page);
  await dialog
    .locator("summary")
    .filter({ hasText: "Neckline short rows" })
    .click();
  const zoom = dialog.getByRole("group", { name: "Your yoke zoom" });
  const canvas = dialog.getByRole("img", { name: "Whole yoke drawing canvas" });
  const fits = () =>
    canvas.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.parentElement!;
      return (
        box.width <= parent.clientWidth && box.height <= parent.clientHeight
      );
    });
  const width = async () => (await canvas.boundingBox())!.width;
  await expect.poll(fits).toBe(true);
  const fitted = await width();
  await zoom.getByRole("button", { name: "Zoom out" }).click();
  expect(await width()).toBeLessThan(fitted);
  await zoom.getByRole("button", { name: "Zoom in" }).click();
  await zoom.getByRole("button", { name: "Fit preview" }).click();
  await expect.poll(width).toBeCloseTo(fitted, 1);
});

for (const custom of [false, true]) {
  test(`complete yoke workflow: ${custom ? "non-repeating custom shaping" : "identical repeats and short rows"}`, async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.route("**/textures/merino-relief.png", (route) =>
      route.fulfill({ path: resolve("public/textures/merino-relief.png") }),
    );
    await create(page);
    const before = await active(page);
    const original = before.document.yoke!;
    const round = original.cells.length;
    const canvas = page.getByRole("img", {
      name: "Photographic knitted fabric preview",
      exact: true,
    });
    const preview = () =>
      canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
      timeout: 45_000,
    });
    const staleNotice = page.getByText("Preview needs a refresh.", {
      exact: true,
    });
    await expect(staleNotice).toBeHidden();
    const originalImage = await preview();
    const cells = page.locator(".chart-svg > g:first-child > rect");
    await page
      .getByRole("button", { name: "Use colour 3", exact: true })
      .click();
    await cells.nth(2).click();
    if (custom) {
      await page.getByLabel("Edit scope").selectOption("one");
      await page
        .getByRole("button", { name: "+ Add stitch", exact: true })
        .click();
      await page.getByRole("button", { name: "SSK", exact: true }).click();
      await cells.nth(2).click();
      await page
        .getByRole("button", { name: "Review shaping changes", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Preview stitch shaping" })
        .getByRole("button", { name: "Apply changes", exact: true })
        .click();
    }
    const end = original.cells.at(-1)!.length - Number(custom);
    const start = original.cells.at(-2)!.length;
    await expect
      .poll(
        async () => (await active(page)).document.yoke!.cells.at(-1)!.length,
        { timeout: 15_000 },
      )
      .toBe(end);
    await expect(page.locator(".yoke-plan-summary")).toContainText(
      `${end} stitches`,
    );
    await expect(
      page.getByText("Preview needs a refresh.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Refresh preview", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
      timeout: 45_000,
    });
    await expect
      .poll(async () => (await preview()) !== originalImage)
      .toBe(true);
    await expect(staleNotice).toBeHidden();

    const knit = page.getByRole("button", { name: "Knit mode", exact: true });
    const mode = page.getByRole("dialog", { name: "Knit mode" });
    await knit.click();
    if (!custom)
      await expect(
        mode.getByLabel("Before Round 1 instructions"),
      ).toBeVisible();
    await mode.getByText("Jump to…", { exact: true }).click();
    await mode
      .getByRole("combobox", { name: "Round", exact: true })
      .selectOption(String(round));
    await expect(
      mode.getByLabel("Round stitch count").locator("strong"),
    ).toHaveText([
      String(start),
      end > start ? `+${end - start}` : String(end - start),
      String(end),
    ]);
    const instructions = mode
      .getByLabel("Current row colour sequence")
      .locator("span");
    // Compare worked steps, ignoring how colour runs are grouped at screen section boundaries.
    const expand = (runs: string[]) =>
      runs.flatMap((run) => {
        const match = /^(MC|CC\d+) (\d+)$/.exec(run.trim());
        return match
          ? Array<string>(Number(match[2])).fill(match[1])
          : [run.trim()];
      });
    const worked = await instructions.allTextContents();
    if (custom) {
      const firstSection = expand(worked);
      const shapingIndex = firstSection.indexOf("SSK(CC2)");
      expect(shapingIndex).toBeGreaterThanOrEqual(0);
      const nextStep = mode.getByRole("button", {
        name: "Next step",
        exact: true,
      });
      for (let i = 0; i <= shapingIndex; i++) await nextStep.click();
      await expect(mode.locator(".knit-current-step strong")).toHaveText(
        "SSK(CC2)",
      );
      const picker = mode.getByRole("combobox", {
        name: "Section",
        exact: true,
      });
      const options = picker.locator("option:enabled");
      expect(await options.count()).toBeGreaterThan(1);
      for (const option of (
        await options.evaluateAll((els) =>
          els.map((el) => (el as HTMLOptionElement).value),
        )
      ).slice(1)) {
        await picker.selectOption(option);
        worked.push(...(await instructions.allTextContents()));
      }
    }
    await mode.getByRole("button", { name: "Next step", exact: true }).click();
    await expect
      .poll(async () => (await active(page)).knitProgress.row)
      .toBe(round);
    await mode
      .getByRole("button", { name: "Exit knit mode", exact: true })
      .click();
    const edited = await active(page);
    expect(edited.knitProgress.stitch).toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator(".yoke-plan-summary")).toContainText(
      `${end} stitches`,
    );
    expect(await active(page)).toMatchObject({
      document: edited.document,
      knitProgress: edited.knitProgress,
    });
    await knit.click();
    await expect(
      mode.getByText(`Round ${round} of ${round}`, { exact: true }),
    ).toBeVisible();
    await mode
      .getByRole("button", { name: "Exit knit mode", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Instructions", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Knitting instructions" });
    const last = dialog.locator(".written-row-list > li").last();
    await expect(last).toContainText(`${start} sts in → ${end} sts out`);
    const written = (await last.locator("div").innerText()).split(", ");
    expect(expand(written)).toEqual(expand(worked));
    if (custom) {
      expect(written.some((run) => run.startsWith("SSK"))).toBe(true);
      await expect(dialog.getByText(/times per round/)).toHaveCount(0);
    } else {
      await expect(dialog.getByText(/12 times per round/)).toHaveCount(2);
      await expect(
        dialog.getByRole("heading", { name: "Back-neck short rows" }),
      ).toBeVisible();
    }
    expect(browserErrors).toEqual([]);
  });
}

test("mirror follows Edit all repeats rather than the current yoke view", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  await page.locator(".chart-svg > g:first-child > rect").nth(2).click();
  await expect
    .poll(async () =>
      (await active(page)).document.yoke!.cells.at(-1)!.includes(2),
    )
    .toBe(true);
  const source = (await active(page)).document.yoke!;
  await page.getByRole("button", { name: "Half yoke", exact: true }).click();
  await page.getByLabel("Half-yoke side", { exact: true }).selectOption("back");
  const editScope = page.getByLabel("Edit scope");
  await editScope.selectOption("one");
  await page
    .getByLabel("Viewing repeat", { exact: true })
    .selectOption({ value: "2" });
  await page
    .getByRole("button", { name: "Mirror design left to right", exact: true })
    .click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells)
    .toEqual(
      source.cells.map((row) => {
        const width = row.length / source.measurements.repeats;
        return [
          ...row.slice(0, 2 * width),
          ...row.slice(2 * width, 3 * width).reverse(),
          ...row.slice(3 * width),
        ];
      }),
    );
  await page
    .getByRole("button", { name: "Standard chart", exact: true })
    .click();
  await expect(
    page
      .locator(".chart-action-symbols")
      .getByText("M1R", { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells)
    .toEqual(source.cells);
  await editScope.selectOption("all");
  await page
    .getByRole("button", { name: "Mirror design left to right", exact: true })
    .click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells)
    .toEqual(source.cells.map((row) => [...row].reverse()));
});

test("repeat groups share new yarn and stitch edits without changing other repeats", async ({
  page,
}) => {
  await create(page);
  await page.getByLabel("Edit scope").selectOption("choose");
  const picker = page.getByRole("dialog", {
    name: "Choose repeats to edit together",
  });
  const front = picker.getByRole("group", { name: "Front repeats" });
  const back = picker.getByRole("group", { name: "Back repeats" });
  await expect(front.getByRole("button")).toHaveText([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
  ]);
  await expect(back.getByRole("button")).toHaveText([
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
  ]);
  await front.getByRole("button", { name: "Repeat 2", exact: true }).click();
  await front.getByRole("button", { name: "Repeat 5", exact: true }).click();
  await picker.getByRole("button", { name: "Apply edit scope" }).click();
  await expect(page.getByLabel("Viewing repeat")).toHaveValue("4");
  await expect(
    page.getByLabel("Edit scope").locator("option:checked"),
  ).toHaveText("Repeats 2, 5");
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  const cells = page.locator(".chart-svg > g:first-child > rect");
  await cells.nth(2).click();
  await expect
    .poll(async () => {
      const project = (await active(page)).document.yoke!;
      const row = project.cells.at(-1)!;
      const width = row.length / project.measurements.repeats;
      return row.flatMap((color, i) =>
        color === 2 ? [Math.floor(i / width)] : [],
      );
    })
    .toEqual([4, 7]);
  await page.getByRole("button", { name: "+ Add stitch", exact: true }).click();
  await page.getByRole("button", { name: "Purl", exact: true }).click();
  await cells.nth(2).click();
  await expect
    .poll(async () =>
      (await active(page)).document
        .yoke!.program?.rounds.at(-1)
        ?.flatMap((section, i) =>
          section.some((op) => op.action === "purl") ? [i] : [],
        ),
    )
    .toEqual([4, 7]);
});

test("identical yokes use one repeat with whole-round counts and short-row instructions", async ({
  page,
}) => {
  await create(page);
  const tab = await active(page);
  await page.getByRole("button", { name: "Knit mode", exact: true }).click();
  const mode = page.getByRole("dialog", { name: "Knit mode" });
  await expect(mode.getByText("Round 1 of", { exact: false })).toBeVisible();
  await expect(
    mode.getByText("Work this repeat 12 times per round."),
  ).toBeVisible();
  await expect(
    mode.getByRole("button", { name: "Next section", exact: true }),
  ).toHaveCount(0);
  await expect(mode.getByLabel("Round stitch count")).toContainText(
    String(tab.document.yoke!.cells[0].length),
  );
  const prelude = mode.getByLabel("Before Round 1 instructions");
  await expect(prelude).toBeVisible();
  await prelude.getByText("Written steps", { exact: true }).click();
  await expect(
    mode.getByText("Short row 1 (RS):", { exact: false }),
  ).toBeVisible();
  await mode.getByRole("button", { name: "Next round", exact: true }).click();
  await expect(mode.getByText("Round 2 of", { exact: false })).toBeVisible();
  await expect(prelude).toHaveCount(0);
  await mode
    .getByRole("button", { name: "Start again from round 1", exact: true })
    .click();
  await expect(prelude).toHaveCount(0);
  await expect
    .poll(async () => (await active(page)).knitProgress.shortRowNoteSeen)
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Knit mode", exact: true }).click();
  await expect(prelude).toHaveCount(0);
});

test("yoke Instructions opens a printable sheet with short rows before the repeated rounds", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Knitting instructions" });
  await expect(
    dialog.getByText("Work each listed sequence 12 times per round.", {
      exact: false,
    }),
  ).toHaveCount(2);
  await expect(dialog.locator(".written-instructions h2 + p")).toHaveText(
    "Work each listed sequence 12 times per round.",
  );
  await expect(dialog.locator(".instruction-sheet h2")).toHaveText([
    "Colour key",
    "How to work the yoke",
    "Back-neck short rows",
    "Written rounds",
  ]);
  await expect(dialog.locator(".written-row-list > li").first()).toContainText(
    /Round 1.*MC 7.*84 sts in → 84 sts out/,
  );
  await page.evaluate(() => {
    window.print = () => document.body.setAttribute("data-printed", "true");
  });
  const print = dialog.getByRole("button", { name: "Print instructions" });
  await print.click();
  await expect(page.locator("body")).toHaveAttribute("data-printed", "true");
  await page.emulateMedia({ media: "print" });
  await expect(
    dialog.getByRole("heading", { name: "Written rounds" }),
  ).toBeVisible();
  await expect(print).toBeHidden();
});

test("nonidentical yokes track progress across sections and remember it after reload", async ({
  page,
}) => {
  const sample = asymmetricYoke;
  const tab = newChartTab(sample.document, "asymmetric-yoke");
  tab.knitProgress = {
    ...tab.knitProgress,
    row: 1,
    section: 0,
    stitch:
      sample.project.cells[0].length / sample.project.measurements.repeats,
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem("knitplot-tutorial-v1", "seen");
    },
    { key, value: JSON.stringify(workspaceSave([tab], tab.id)) },
  );
  await page.goto("/");
  const open = page.getByRole("button", { name: "Knit mode", exact: true });
  await open.click();
  const mode = page.getByRole("dialog", { name: "Knit mode" });
  await mode.getByText("Jump to…", { exact: true }).click();
  const picker = mode.getByRole("combobox", { name: "Section", exact: true });
  await expect(picker).toHaveValue("0");
  await mode.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(picker).toHaveValue("0");
  await expect(
    mode.getByText("Marker on step 11 of", { exact: false }),
  ).toBeVisible();
  await mode
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(picker).toHaveValue("0");
  await picker.selectOption({ value: "1" });
  const expectedStep = yokeKnitPages(
    sample.project,
    yokeKnitModel(sample.project),
  )[1].rows[0].steps[0];
  await mode.getByRole("button", { name: "Next step", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).knitProgress)
    .toMatchObject({
      row: 1,
      section: expectedStep.sourceSection,
      stitch: expectedStep.sourceStep,
      viewSection: 1,
    });
  await page.reload();
  await open.click();
  await mode.getByText("Jump to…", { exact: true }).click();
  await expect(picker).toHaveValue("1");
  await expect(
    mode.getByText("Marker on step 1 of", { exact: false }),
  ).toBeVisible();
  await picker.selectOption({ value: "4" });
  await mode.getByRole("button", { name: "Next round", exact: true }).click();
  await expect(picker).toHaveValue("0");
  await expect(mode.getByText("Round 2 of", { exact: false })).toBeVisible();
});

test("wide yoke sections advance with one main button, preserve markers, and remember the size setting", async ({
  page,
}) => {
  const sample = wideYoke;
  const tab = newChartTab(
    yokeDocument(paintYoke(sample.project, 0, 0, 1, false)),
    "wide-yoke",
  );
  tab.knitProgress = { ...tab.knitProgress, row: 24, section: 0, stitch: 1 };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem("knitplot-tutorial-v1", "seen");
    },
    { key, value: JSON.stringify(workspaceSave([tab], tab.id)) },
  );
  await page.goto("/");
  const open = page.getByRole("button", { name: "Knit mode", exact: true });
  await open.click();
  const mode = page.getByRole("dialog", { name: "Knit mode" });
  const chart = mode.locator(".knit-mode-chart");
  const size = mode.getByRole("combobox", {
    name: "Max columns per section",
    exact: true,
  });
  await expect(size).toHaveValue("100");
  const columnsDrawn = () => chart.locator("g").first().locator("rect").count();
  expect(await columnsDrawn()).toBe(88 * sample.document.height);
  await expect(
    mode.getByRole("button", { name: "Next round", exact: true }),
  ).toHaveCount(0);
  await expect(
    mode.locator(".knit-sequence + .knit-row-controls + .knit-step-controls"),
  ).toHaveCount(1);
  await mode.getByRole("button", { name: "Next section", exact: true }).click();
  await expect(
    mode
      .locator(".knit-mode-status")
      .getByText("Section 2 of 3", { exact: true }),
  ).toBeVisible();
  expect(await columnsDrawn()).toBe(87 * sample.document.height);
  await expect(
    mode.getByText("Marker saved in section 1", { exact: true }),
  ).toBeVisible();
  await mode.getByRole("button", { name: "Go to marker", exact: true }).click();
  await expect(
    mode
      .locator(".knit-mode-status")
      .getByText("Section 1 of 3", { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 2; i++)
    await mode
      .getByRole("button", { name: "Next section", exact: true })
      .click();
  await mode.getByRole("button", { name: "Next round", exact: true }).click();
  await expect(mode.getByText("Round 25 of", { exact: false })).toBeVisible();
  await expect(
    mode
      .locator(".knit-mode-status")
      .getByText("Section 1 of 3", { exact: true }),
  ).toBeVisible();
  await size.selectOption("50");
  expect(await columnsDrawn()).toBe(44 * sample.document.height);
  await expect
    .poll(async () => (await active(page)).knitProgress.sectionColumns)
    .toBe(50);
  await page.reload();
  await open.click();
  await expect(size).toHaveValue("50");
});

test("yoke controls match the chart toolbar, stay inset and use the shared repeat switch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() =>
    localStorage.setItem("knitplot-tutorial-v1", "seen"),
  );
  await page.goto("/");
  await page.getByLabel("Stitches", { exact: true }).first().fill("31");
  const resize = page.getByRole("button", {
    name: "Resize chart",
    exact: true,
  });
  await expect(resize).toBeEnabled();
  await resize.hover();
  await expect(resize).toHaveCSS("transform", "none");
  await expect(resize).toHaveCSS("border-color", "rgb(197, 202, 187)");
  await create(page);
  const editor = page.locator(".yoke-editor-panel");
  await expect(
    editor.getByRole("button", {
      name: /Rotate .*90 degrees|Flip .*upside down/,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".yoke-standard-chart")).toHaveCSS(
    "max-height",
    "none",
  );
  expect(
    await page
      .locator(".yoke-standard-chart")
      .evaluate((el) => el.scrollHeight - el.clientHeight),
  ).toBeLessThanOrEqual(1);
  await expect(
    editor.getByRole("button", {
      name: "Mirror design left to right",
      exact: true,
    }),
  ).toHaveCSS("font-size", "18px");
  await expect(page.locator(".yoke-plan-summary p").last()).toHaveCSS(
    "font-size",
    "12px",
  );
  const zoom = page.getByLabel("Yoke zoom", { exact: true });
  const zoomOut = editor.getByRole("button", { name: "Zoom out", exact: true });
  await expect(zoomOut).toBeDisabled();
  await expect(zoom.locator('option[value="25"]')).toBeDisabled();
  await editor.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(zoom).toHaveValue("150");
  await editor.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(zoom).toHaveValue("100");
  await expect(zoomOut).toBeDisabled();
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await expect(zoomOut).toBeEnabled();
  await zoom.selectOption("25");
  await page
    .getByRole("button", { name: "Standard chart", exact: true })
    .click();
  await expect(zoom).toHaveValue("100");
  await expect(zoomOut).toBeDisabled();
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await expect(zoom).toHaveValue("25");
  await page
    .getByRole("button", { name: "Standard chart", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy repeat…", exact: true }),
  ).toHaveClass(/secondary-button/);
  const scopeControl = page.getByLabel("Edit scope");
  await expect(scopeControl).toHaveValue("all");
  await scopeControl.selectOption("one");
  await expect(scopeControl).toHaveValue("one");
  await scopeControl.selectOption("all");
  await expect(scopeControl).toHaveValue("all");
  for (const width of [1280, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await editor.boundingBox();
    const buttons = editor
      .getByRole("group", { name: "Yoke views", exact: true })
      .getByRole("button");
    for (const button of await buttons.all()) {
      await expect(button).toHaveCSS("font-size", "12px");
      const bounds = await button.boundingBox();
      expect(bounds!.x - box!.x).toBeGreaterThanOrEqual(16);
      expect(
        box!.x + box!.width - bounds!.x - bounds!.width,
      ).toBeGreaterThanOrEqual(16);
    }
    await page.screenshot({ path: `/tmp/knitplot-yoke-polish-${width}.png` });
  }
  const gauge = page.locator(".yoke-gauge-panel");
  for (const name of ["Update gauge", "Edit shaping"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.hover();
    await expect(button).toHaveCSS("transform", "none");
    await expect(button).toHaveCSS("border-color", "rgb(197, 202, 187)");
    await expect(button).toHaveCSS(
      "box-shadow",
      "rgba(60, 50, 35, 0.04) 0px 1px 2px 0px",
    );
  }
  await expect(
    gauge.getByRole("button", { name: "Update gauge", exact: true }),
  ).toHaveCSS("font-size", "12px");
  await gauge.screenshot({ path: "/tmp/knitplot-yoke-gauge-polish.png" });
});

test("yokes share chart tabs, preserve gauge edits, and fork structural revisions", async ({
  page,
}) => {
  await create(page);
  await expect(page.getByText("Chart size", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Chart name" }).fill("My yoke");
  const before = (await active(page)).document;
  const index = before
    .stitchActions!.flat()
    .findIndex((action) => action === "knit");
  await page.locator(".chart-svg > g:first-child > rect").nth(index).click();
  await expect
    .poll(async () => JSON.stringify((await active(page)).document.yoke!.cells))
    .not.toBe(JSON.stringify(before.yoke!.cells));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells)
    .toEqual(before.yoke!.cells);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify((await active(page)).document.yoke!.cells))
    .not.toBe(JSON.stringify(before.yoke!.cells));
  const painted = (await active(page)).document.yoke!;
  await page.getByLabel("Gauge stitches", { exact: true }).fill("22");
  await page.getByRole("button", { name: "Update gauge", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await active(page)).document.yoke!.measurements.gaugeStitches,
    )
    .toBe(22);
  expect((await active(page)).document.yoke!.cells).toEqual(painted.cells);
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).preview.yokeView)
    .toBe("whole");
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Whole yoke drawing canvas", exact: true }),
  ).toBeVisible();
  const original = await active(page);
  await page.getByRole("button", { name: "Edit shaping", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit yoke shaping" });
  await dialog
    .getByLabel("Full-round yoke length", { exact: false })
    .fill("25");
  await dialog
    .getByRole("button", { name: "Calculate targets", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Preview yoke", exact: true })
    .click();
  await dialog.getByLabel("Scale design to fit", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Create revised yoke", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Chart name" })).toHaveValue(
    "My yoke revised",
  );
  await expect.poll(async () => (await saved(page)).tabs.length).toBe(3);
  expect(
    readChartDocument(
      (await saved(page)).tabs.find((tab) => tab.id === original.id)!.document,
    ),
  ).toEqual(readChartDocument(original.document));
});

async function curvedPoint(
  page: Page,
  project: YokeProject,
  view: YokeView,
  row: number,
  column: number,
  sideways = false,
) {
  const counts = project.cells.map((row) => row.length),
    aspect =
      project.measurements.gaugeRows / project.measurements.gaugeStitches;
  const g = yokeGeometry(counts, project.measurements.repeats, view, aspect);
  const v = yokeCanvasViewport(
    counts,
    project.measurements.repeats,
    view,
    aspect,
  );
  const angle = g.startAngle + ((column + 0.5) / g.shownCounts[row]) * g.arc,
    radius = g.inner + (row + 0.5) * g.radialHeight;
  const canvas = page.locator(".workspace .editor canvas");
  await canvas.locator("..").scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const display = presentYokePoint(
    {
      x: g.cx + Math.cos(angle) * radius - v.x,
      y: g.cy + Math.sin(angle) * radius - v.y,
    },
    v.width,
    sideways,
  );
  const point = {
    x: (display.x / (sideways ? v.height : v.width)) * box.width,
    y: (display.y / (sideways ? v.width : v.height)) * box.height,
  };
  await canvas.evaluate((el, p) => {
    const parent = el.parentElement!;
    parent.scrollLeft = p.x - parent.clientWidth / 2;
    parent.scrollTop = p.y - parent.clientHeight / 2;
  }, point);
  const scrolled = (await canvas.boundingBox())!;
  return { x: scrolled.x + point.x, y: scrolled.y + point.y };
}

test("repeat picker isolates edits and normal selection tools preserve shaping", async ({
  page,
}) => {
  await create(page);
  await page.getByLabel("Edit scope").selectOption("one");
  await page
    .getByLabel("Viewing repeat", { exact: true })
    .selectOption({ value: "2" });
  await expect(page.getByLabel("Viewing repeat")).toHaveValue("2");
  const before = (await active(page)).document.yoke!;
  const width = before.cells.at(-1)!.length / before.measurements.repeats;
  const rect = page.locator(".chart-svg > g:first-child > rect");
  await rect.nth(1).click();
  await expect
    .poll(
      async () =>
        (await active(page)).document.yoke!.cells.at(-1)![2 * width + 1],
    )
    .toBe(1);
  expect((await active(page)).document.yoke!.cells.at(-1)![1]).toBe(0);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await rect.nth(1).scrollIntoViewIfNeeded();
  const a = (await rect.nth(1).boundingBox())!,
    b = (await rect.nth(width + 2).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  for (const name of [
    "Copy",
    "Cut",
    "Fill selection",
    "Move selection left",
    "Mirror selection left to right",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Mirror selection left to right",
      exact: true,
    })
    .click();
  await expect
    .poll(
      async () =>
        (await active(page)).document.yoke!.cells.at(-1)![2 * width + 2],
    )
    .toBe(1);
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await active(page)).document.yoke!.cells.at(-1)![2 * width + 1],
    )
    .toBe(1);
  await expect(
    page.getByRole("button", {
      name: /Rotate selection|Flip selection upside down/,
    }),
  ).toHaveCount(0);
  expect((await active(page)).document.yoke!.events).toEqual(before.events);
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  await expect(page.locator(".palette-row").nth(2)).toHaveClass(/selected/);
  await page
    .getByRole("button", { name: "Fill selection", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await active(page)).document
        .yoke!.cells.at(-1)!
        .slice(2 * width + 1, 2 * width + 3),
    )
    .toEqual([2, 2]);
  expect((await active(page)).document.yoke!.cells.at(-1)!.slice(1, 3)).toEqual(
    [0, 0],
  );
});

test("curved drawing has readable cells, increase marks, repeat isolation and accurate zoomed selection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    (window as unknown as { canvasLabels: string[] }).canvasLabels = [];
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      (window as unknown as { canvasLabels: string[] }).canvasLabels.push(text);
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await create(page);
  await page.getByLabel("Edit scope").selectOption("one");
  await page
    .getByLabel("Viewing repeat", { exact: true })
    .selectOption({ value: "2" });
  await page.getByRole("button", { name: "One repeat", exact: true }).click();
  const project = (await active(page)).document.yoke!;
  let point = await curvedPoint(page, project, "repeat", 2, 1);
  await page.mouse.click(point.x, point.y);
  const width = project.cells[2].length / project.measurements.repeats;
  await expect
    .poll(
      async () => (await active(page)).document.yoke!.cells[2][2 * width + 1],
    )
    .toBe(1);
  expect((await active(page)).document.yoke!.cells[2][1]).toBe(0);
  const labels = await page.evaluate(
    () => (window as unknown as { canvasLabels: string[] }).canvasLabels,
  );
  expect(labels.some((text) => text === "M1L" || text === "M1R")).toBe(true);
  expect(labels.some((text) => /neck edge|start of round/i.test(text))).toBe(
    false,
  );
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("200");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  point = await curvedPoint(page, project, "repeat", 2, 2);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  await page
    .getByRole("button", { name: "Fill selection", exact: true })
    .click();
  await expect
    .poll(
      async () => (await active(page)).document.yoke!.cells[2][2 * width + 2],
    )
    .toBe(2);
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("100");
  await page
    .locator(".yoke-canvas-scroll")
    .screenshot({ path: "/tmp/knitplot-yoke-readable-repeat.png" });
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("25");
  await page
    .locator(".yoke-canvas-scroll")
    .screenshot({ path: "/tmp/knitplot-yoke-readable-whole.png" });
});

test("a complete yoke downloads, reopens in a new tab and saves through My Charts", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("menuitem", {
      name: "Download editable KnitPlot file",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const opened = readProject(JSON.parse(bytes.toString()));
  expect(opened.yoke).toEqual((await active(page)).document.yoke);
  await page.locator('input[type="file"][accept^=".knitplot,"]').setInputFiles({
    name: "reopen.knitplot",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect.poll(async () => (await saved(page)).tabs.length).toBe(3);
  const chart = await active(page);
  const id = "a21d4c9a-1122-4234-8234-123456789abc";
  let stored: unknown;
  await page.route("**/api/charts", (route) => {
    stored = route.request().postDataJSON();
    return route.fulfill({ json: { id, version: 1 } });
  });
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Save to My Charts", exact: true })
    .click();
  await expect.poll(async () => (await active(page)).cloudId).toBe(id);
  expect((stored as { document: typeof chart.document }).document.yoke).toEqual(
    chart.document.yoke,
  );
});

test("fill crosses increase placeholders and copying repeats is explicit, confirmed and undoable", async ({
  page,
}) => {
  await create(page);
  await expect(
    page.getByText("M1L / M1R · planned increases", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Dark cells are no stitch/)).toHaveCount(0);
  await page.getByLabel("Edit scope").selectOption("one");
  await page
    .getByLabel("Viewing repeat", { exact: true })
    .selectOption({ value: "2" });
  const project = (await active(page)).document.yoke!;
  await page.getByRole("button", { name: "Fill", exact: true }).click();
  await page.locator(".chart-svg > g:first-child > rect").nth(1).click();
  await expect
    .poll(async () => {
      const p = (await active(page)).document.yoke!;
      return p.cells.every((row) => {
        const width = row.length / p.measurements.repeats;
        return row.slice(2 * width, 3 * width).every((color) => color === 1);
      });
    })
    .toBe(true);
  const independent = (await active(page)).document.yoke!;
  expect(independent.cells.every((row) => row[0] === 0)).toBe(true);
  const copy = page.getByRole("button", {
    name: "Copy repeat…",
    exact: true,
  });
  await copy.hover();
  await expect(copy).toHaveCSS("transform", "none");
  await expect(copy).toHaveCSS("border-color", "rgb(197, 202, 187)");
  await page.getByLabel("Edit scope").selectOption("all");
  expect((await active(page)).document.yoke!.cells).toEqual(independent.cells);
  const picker = page.getByRole("dialog", {
    name: "Copy colours from repeat 12",
  });
  await copy.click();
  await picker.getByRole("button", { name: "All other repeats" }).click();
  await picker.getByRole("button", { name: "Cancel" }).click();
  expect((await active(page)).document.yoke!.cells).toEqual(independent.cells);
  await page.getByLabel("Edit scope").selectOption("one");
  await copy.click();
  await picker.getByRole("button", { name: "Repeat 2", exact: true }).click();
  await picker.getByRole("button", { name: "Copy to 1 repeat" }).click();
  await expect
    .poll(async () => {
      const row = (await active(page)).document.yoke!.cells.at(-1)!;
      const width = row.length / project.measurements.repeats;
      return row.filter((_, i) => i % width === 0);
    })
    .toEqual([0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  await expect(page.getByLabel("Edit scope")).toHaveValue("one");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells)
    .toEqual(independent.cells);
  await copy.click();
  await picker.getByRole("button", { name: "All other repeats" }).click();
  await picker.getByRole("button", { name: "Copy to 11 repeats" }).click();
  await expect
    .poll(async () =>
      (await active(page)).document.yoke!.cells.every((row) =>
        row.every((color) => color === 1),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.stringify((await active(page)).document.yoke!.cells) ===
        JSON.stringify(independent.cells),
    )
    .toBe(true);
  expect((await active(page)).document.yoke!.events).toEqual(project.events);
});

test("back-facing half renders back short rows that are absent at the front centre", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "Half yoke", exact: true }).click();
  const project = (await active(page)).document.yoke!,
    counts = project.cells.map((row) => row.length);
  const aspect =
    project.measurements.gaugeRows / project.measurements.gaugeStitches;
  async function alpha(view: "front" | "back") {
    const g = yokeGeometry(counts, project.measurements.repeats, view, aspect);
    const v = yokeCanvasViewport(
      counts,
      project.measurements.repeats,
      view,
      aspect,
    );
    return page.locator(".workspace .editor canvas").evaluate(
      (el, point) => {
        const canvas = el as HTMLCanvasElement;
        return canvas
          .getContext("2d")!
          .getImageData(
            Math.round(point.x * canvas.width),
            Math.round(point.y * canvas.height),
            1,
            1,
          ).data[3];
      },
      {
        x: (g.cx - v.x) / v.width,
        y: (g.cy + g.inner - g.radialHeight * 0.5 - v.y) / v.height,
      },
    );
  }
  await expect.poll(() => alpha("front")).toBe(0);
  await page.getByLabel("Half-yoke side", { exact: true }).selectOption("back");
  await expect.poll(() => alpha("back")).toBe(255);
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("25");
  await page
    .locator(".yoke-canvas-scroll")
    .screenshot({ path: "/tmp/knitplot-back-half-shortrows.png" });
  await page
    .getByLabel("Half-yoke side", { exact: true })
    .selectOption("front");
  await expect.poll(() => alpha("front")).toBe(0);
  expect((await active(page)).document.yoke!.cells).toEqual(project.cells);
});

test("the main yoke stitch palette applies purl, recolours symbols and survives file/workspace roundtrips", async ({
  page,
}) => {
  await create(page);
  await expect(page.locator(".stitch-settings summary")).toContainText(
    "Stitches",
  );
  await page.getByLabel("Edit scope").selectOption("one");
  await page.getByRole("button", { name: "+ Add stitch", exact: true }).click();
  await page.getByRole("button", { name: "Purl", exact: true }).click();
  await page.locator(".chart-svg > g:first-child > rect").nth(1).click();
  await expect
    .poll(async () => (await active(page)).document.yoke?.version)
    .toBe(2);
  await expect(
    page.getByRole("dialog", { name: "Preview stitch shaping" }),
  ).toHaveCount(0);
  let doc = (await active(page)).document;
  expect(
    doc.yoke!.program!.rounds.at(-1)![0].some((op) => op.action === "purl"),
  ).toBe(true);
  await page
    .getByLabel("Change Purl stitch display colour", { exact: true })
    .fill("#f06292");
  await expect
    .poll(async () => (await active(page)).document.yoke!.stitchColors?.purl)
    .toBe("#f06292");
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  const purl = page
    .locator(".chart-action-symbols text")
    .filter({ hasText: /^P$/ })
    .first();
  const purlX = Number(await purl.getAttribute("x"));
  const rects = page.locator(".chart-svg > g:first-child > rect");
  const width = (await active(page)).document.width;
  const aspect =
    (await active(page)).document.gaugeRows /
    (await active(page)).document.gaugeStitches;
  const column = Math.floor(purlX / aspect);
  await rects.nth(column).click();
  await expect
    .poll(async () => (await active(page)).document.cells[0][column])
    .toBe("yarn-2");
  expect((await active(page)).document.stitchActions![0][column]).toBe("purl");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Draw Purl stitch", exact: true }),
  ).toBeVisible();
  doc = (await active(page)).document;
  expect(doc.width).toBe(width);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("menuitem", {
      name: "Download editable KnitPlot file",
      exact: true,
    })
    .click();
  const download = await waiting,
    stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const opened = readProject(JSON.parse(Buffer.concat(chunks).toString()));
  expect(opened.yoke).toEqual(doc.yoke);
});

test("several shaping strokes wait for one review and remain pending across chart tabs", async ({
  page,
}) => {
  await create(page);
  await page.getByLabel("Edit scope").selectOption("one");
  await page.getByRole("button", { name: "+ Add stitch", exact: true }).click();
  await page.getByRole("button", { name: "SSK", exact: true }).click();
  const cells = page.locator(".chart-svg > g:first-child > rect");
  await cells.nth(2).click();
  await cells.nth(6).click();
  const pending = page.getByRole("region", { name: "Pending shaping changes" });
  await expect(pending).toContainText("2 pending shaping edits");
  const leaveAttempts: string[] = [];
  for (const link of [
    () => page.locator('a[href="/account"]'),
    () => page.getByRole("menuitem", { name: "View My Charts", exact: true }),
  ]) {
    if (!(await link().isVisible()))
      await page.getByRole("button", { name: "File", exact: true }).click();
    page.once("dialog", async (prompt) => {
      leaveAttempts.push(prompt.message());
      await prompt.dismiss();
    });
    await link().click();
    await expect(pending).toContainText("2 pending shaping edits");
  }
  expect(leaveAttempts).toEqual([
    "You have unapplied shaping changes. Leave without applying them?",
    "You have unapplied shaping changes. Leave without applying them?",
  ]);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/tmp/knitplot-yoke-batch-pending.png" });
  await expect(
    page.getByRole("dialog", { name: "Preview stitch shaping" }),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".chart-action-symbols text")
      .filter({ hasText: /^SSK$/ })
      .count(),
  ).toBe(2);
  const original = await active(page);
  await page.getByRole("tab", { name: "Untitled chart", exact: true }).click();
  await page.getByRole("tab", { name: "Untitled yoke", exact: true }).click();
  await expect(pending).toContainText("2 pending shaping edits");
  await page
    .getByRole("button", { name: "Review shaping changes", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview stitch shaping",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const before =
    original.document.yoke!.cells.at(-1)!.length /
    original.document.yoke!.measurements.repeats;
  await expect(dialog.getByRole("row").nth(1)).toContainText(
    `${before} → ${before - 2}`,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(pending).toContainText("2 pending shaping edits");
  await page
    .getByRole("button", { name: "Discard shaping edits", exact: true })
    .click();
  await expect(pending).toHaveCount(0);
  expect((await active(page)).document).toEqual(original.document);
  await page.getByLabel("Edit scope").selectOption("one");
  await page
    .getByRole("button", { name: "Draw Slip, slip, knit", exact: true })
    .click();
  await cells.nth(2).click();
  await cells.nth(3).click();
  await page
    .getByRole("button", { name: "Review shaping changes", exact: true })
    .click();
  await expect(
    page.locator(".yoke-editor-panel").getByRole("alert"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Preview stitch shaping" }),
  ).toHaveCount(0);
  await expect(pending).toContainText("2 pending shaping edits");
  expect((await active(page)).document).toEqual(original.document);
  await page
    .getByRole("button", { name: "Discard shaping edits", exact: true })
    .click();
});

test.describe("high-resolution yoke canvas", () => {
  test.use({ deviceScaleFactor: 2 });
  test("fits a native-resolution bitmap to a Retina screen and responds to density changes", async ({
    page,
  }) => {
    await create(page);
    const original = (await active(page)).document;
    await page.getByRole("button", { name: "One repeat", exact: true }).click();
    await page.getByRole("button", { name: "Sideways", exact: true }).click();
    await page
      .getByRole("button", { name: "Fit whole repeat", exact: true })
      .click();
    const canvas = page.locator(".yoke-canvas-navigable canvas");
    const densityError = (ratio: number) =>
      canvas.evaluate(
        (el, ratio) =>
          Math.max(
            Math.abs(
              (el as HTMLCanvasElement).width -
                el.getBoundingClientRect().width * ratio,
            ),
            Math.abs(
              (el as HTMLCanvasElement).height -
                el.getBoundingClientRect().height * ratio,
            ),
          ),
        ratio,
      );
    await expect.poll(() => densityError(2)).toBeLessThanOrEqual(1.1);
    await canvas.screenshot({ path: "/tmp/knitplot-sideways-retina.png" });
    await page.evaluate(() => {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: 1,
      });
      window.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => densityError(1)).toBeLessThanOrEqual(1.1);
    expect((await active(page)).document).toEqual(original);
  });
});

test("orientation shares the view row when space allows and repeat controls stay below", async ({
  page,
}) => {
  await create(page);
  await page.getByRole("button", { name: "One repeat", exact: true }).click();
  const navigation = page.locator(".yoke-repeat-navigation");
  const views = page.getByRole("group", { name: "Yoke views", exact: true });
  const scope = page.locator(".yoke-editing-scope");
  await expect(scope.getByLabel("Edit scope", { exact: true })).toBeVisible();
  for (const width of [1435, 900]) {
    await page.setViewportSize({ width, height: 800 });
    const n = (await navigation.boundingBox())!,
      v = (await views.boundingBox())!,
      s = (await scope.boundingBox())!;
    if (width === 1435)
      expect(Math.abs(n.y + n.height / 2 - v.y - v.height / 2)).toBeLessThan(2);
    else expect(n.y).toBeGreaterThanOrEqual(v.y + v.height);
    expect(s.y).toBeGreaterThanOrEqual(n.y + n.height);
    const editor = (await page.locator(".yoke-editor-panel").boundingBox())!;
    expect(n.x + n.width).toBeLessThanOrEqual(editor.x + editor.width - 16);
    await page.locator(".yoke-view-tabs").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/knitplot-yoke-control-rows-${width}.png`,
    });
  }
});

test("one-repeat orientation, fit, cursor zoom and Space panning do not alter the design", async ({
  page,
}) => {
  await create(page);
  await page.getByLabel("Edit scope").selectOption("one");
  await page.getByRole("button", { name: "One repeat", exact: true }).click();
  const canvas = page.getByRole("img", {
    name: "One repeat drawing canvas",
    exact: true,
  });
  const project = (await active(page)).document.yoke!;
  await page.getByRole("button", { name: "Sideways", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-orientation", "sideways");
  await page
    .getByRole("button", { name: "Fit whole repeat", exact: true })
    .click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (el) =>
          el.getBoundingClientRect().width <=
            el.parentElement!.clientWidth + 1 &&
          el.getBoundingClientRect().height <=
            el.parentElement!.clientHeight + 1,
      ),
    )
    .toBe(true);
  expect((await active(page)).document.yoke).toEqual(project);
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  let point = await curvedPoint(page, project, "repeat", 8, 3, true);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells[8][3])
    .toBe(2);
  expect(
    (await active(page)).document.yoke!.cells[8][
      project.cells[8].length / project.measurements.repeats + 3
    ],
  ).toBe(0);
  await page.getByRole("button", { name: "Upright", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-orientation", "upright");
  point = await curvedPoint(page, project, "repeat", 8, 4);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells[8][4])
    .toBe(2);
  await page.getByRole("button", { name: "Sideways", exact: true }).click();
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("200");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  point = await curvedPoint(page, project, "repeat", 15, 4, true);
  await page.mouse.click(point.x, point.y);
  await page
    .getByRole("button", { name: "Fill selection", exact: true })
    .click();
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells[15][4])
    .toBe(2);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  point = await curvedPoint(page, project, "repeat", 30, 4, true);
  await page.mouse.move(point.x, point.y);
  const before = (await canvas.boundingBox())!;
  const anchor = {
    x: (point.x - before.x) / before.width,
    y: (point.y - before.y) / before.height,
  };
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByLabel("Yoke zoom", { exact: true })).toHaveValue(
    "230",
  );
  const after = (await canvas.boundingBox())!;
  expect(Math.abs(after.x + anchor.x * after.width - point.x)).toBeLessThan(3);
  expect(Math.abs(after.y + anchor.y * after.height - point.y)).toBeLessThan(3);
  const design = (await active(page)).document;
  const scroll = () =>
    canvas.evaluate((el) => ({
      x: el.parentElement!.scrollLeft,
      y: el.parentElement!.scrollTop,
    }));
  const start = await scroll();
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(point.x - 60, point.y - 40, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const end = await scroll();
  expect(Math.abs(end.x - start.x) + Math.abs(end.y - start.y)).toBeGreaterThan(
    20,
  );
  expect((await active(page)).document).toEqual(design);
  await page
    .getByRole("button", { name: "Fit whole repeat", exact: true })
    .click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (el) =>
          el.getBoundingClientRect().width <=
            el.parentElement!.clientWidth + 1 &&
          el.getBoundingClientRect().height <=
            el.parentElement!.clientHeight + 1,
      ),
    )
    .toBe(true);
  await page.locator(".yoke-repeat-navigation").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/knitplot-sideways-repeat.png" });
});

test("reviewed shaping applies in place at eight tabs and supports undo, redo and reload", async ({
  page,
}) => {
  await create(page);
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect.poll(async () => (await saved(page)).tabs.length).toBe(8);
  await page.getByLabel("Edit scope").selectOption("one");
  await page.getByRole("button", { name: "+ Add stitch", exact: true }).click();
  await page.getByRole("button", { name: "SSK", exact: true }).click();
  await expect
    .poll(async () =>
      (await active(page)).document.yoke!.stitchPalette?.includes("ssk"),
    )
    .toBe(true);
  const original = await active(page);
  const otherTabs = (await saved(page)).tabs.filter(
    (tab) => tab.id !== original.id,
  );
  const cells = page.locator(".chart-svg > g:first-child > rect");
  await cells.nth(2).click();
  await cells.nth(6).click();
  await page
    .getByRole("button", { name: "Review shaping changes", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview stitch shaping",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Create a separate copy", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Pending shaping changes" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells.at(-1)!.length)
    .toBe(original.document.yoke!.cells.at(-1)!.length - 2);
  const applied = await active(page);
  expect(applied.id).toBe(original.id);
  expect(applied.document.name).toBe(original.document.name);
  expect(applied.knitProgress).toEqual(original.knitProgress);
  expect(applied.preview).toEqual(original.preview);
  expect(
    (await saved(page)).tabs.filter((tab) => tab.id !== original.id),
  ).toEqual(otherTabs);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".yoke-plan-summary")).toContainText(
    `${original.document.yoke!.cells.at(-1)!.length} stitches`,
  );
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const workspace = JSON.parse(localStorage.getItem(key)!);
        return workspace.tabs
          .find((tab: { id: string }) => tab.id === workspace.activeTabId)
          .document.yoke.cells.at(-1).length;
      }, key),
    )
    .toBe(original.document.yoke!.cells.at(-1)!.length);
  expect((await active(page)).document).toEqual(
    restoreYokeHistoryDocument(applied.document, original.document),
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await active(page)).document)
    .toEqual(applied.document);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit shaping", exact: true }),
  ).toBeVisible();
  expect((await active(page)).document).toEqual(applied.document);
  expect((await saved(page)).tabs.length).toBe(8);
});

test("shaping one repeat previews, cancels safely, forks a revision and stays editable across views", async ({
  page,
}) => {
  await create(page);
  await page.getByLabel("Edit scope").selectOption("one");
  await page.getByRole("button", { name: "+ Add stitch", exact: true }).click();
  await page.getByRole("button", { name: "SSK", exact: true }).click();
  await expect
    .poll(async () =>
      (await active(page)).document.yoke!.stitchPalette?.includes("ssk"),
    )
    .toBe(true);
  const original = await active(page),
    base = original.document.yoke!;
  await page.locator(".chart-svg > g:first-child > rect").nth(2).click();
  const dialog = page.getByRole("dialog", {
    name: "Preview stitch shaping",
    exact: true,
  });
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Pending shaping changes" }),
  ).toContainText("1 pending shaping edits");
  await page
    .getByRole("button", { name: "Review shaping changes", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  const perRepeat = base.cells.at(-1)!.length / base.measurements.repeats;
  await expect(dialog.getByRole("row").nth(1)).toContainText(
    `${perRepeat} → ${perRepeat - 1}`,
  );
  await expect(dialog.getByRole("row").nth(2)).toContainText(
    `${perRepeat} → ${perRepeat}`,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await active(page)).document.yoke).toEqual(base);
  await page
    .getByRole("button", { name: "Undo shaping edit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review shaping changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Redo shaping edit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review shaping changes", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Create a separate copy", exact: true })
    .click();
  await expect.poll(async () => (await saved(page)).tabs.length).toBe(3);
  await expect
    .poll(async () => (await active(page)).document.yoke!.cells.at(-1)!.length)
    .toBe(base.cells.at(-1)!.length - 1);
  expect(
    (await saved(page)).tabs.find((tab) => tab.id === original.id)!.document
      .yoke,
  ).toEqual(base);
  await page.getByRole("button", { name: "One repeat", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "One repeat drawing canvas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Whole yoke", exact: true }).click();
  await page.getByLabel("Yoke zoom", { exact: true }).selectOption("25");
  await page
    .locator(".yoke-canvas-scroll")
    .screenshot({ path: "/tmp/knitplot-main-independent-repeat.png" });
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Whole yoke drawing canvas", exact: true }),
  ).toBeVisible();
  expect((await active(page)).document.yoke!.cells.at(-1)!.length).toBe(
    base.cells.at(-1)!.length - 1,
  );
});
