import { test, expect } from "@playwright/test";
import {
  cloneDocument,
  defaultDocument,
  createStitchActions,
} from "../lib/chart";
import { newChartTab, workspaceSave } from "../lib/workspace";

test.beforeEach(async ({ page }) => {
  // Each test runs in an isolated browser context, with no user's stored charts.
  await page.addInitScript(() =>
    localStorage.setItem("knitplot-tutorial-v1", "seen"),
  );
});

test("anonymous editor supports draw, undo, redo, and immediate save/reload", async ({
  page,
}) => {
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Chart name" });
  await name.fill("Browser smoke test");
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  const cell = page.locator(".chart-svg > g:first-child > rect").nth(100);
  await cell.click();
  await expect(cell).toHaveAttribute("fill", "#c86f52");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell).toHaveAttribute("fill", "#f2eadf");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(cell).toHaveAttribute("fill", "#c86f52");
  await page.reload();
  await expect(name).toHaveValue("Browser smoke test");
  await expect(cell).toHaveAttribute("fill", "#c86f52");
  await expect(
    page.getByRole("button", { name: "Generate with AI", exact: true }),
  ).toHaveCount(0);
});

test("the production chart editor still renders the photographic swatch", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByRole("img", {
    name: "Photographic knitted fabric preview",
    exact: true,
  });
  await expect(canvas).toHaveAttribute("data-preview-state", "ready", {
    timeout: 30_000,
  });
  expect(
    await canvas.evaluate((el) => (el as HTMLCanvasElement).width),
  ).toBeGreaterThan(100);
});

test("missing Clerk configuration never grants private chart access", async ({
  request,
}) => {
  const response = await request.get(
    "/api/charts/a21d4c9a-1122-4234-8234-123456789abc",
  );
  expect(response.status()).toBe(401);
});

test("chart image downloads offer grid lines on or off without changing the chart", async ({
  page,
}) => {
  await page.goto("/");
  const cell = page.locator(".chart-svg > g:first-child > rect").first();
  const originalColor = await cell.getAttribute("fill");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Download chart image", exact: true })
    .click();

  const images: number[][] = [];
  for (const showGrid of [true, false]) {
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("menuitem", {
        name: showGrid ? "With grid" : "Without grid",
        exact: true,
      })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(
      showGrid ? /\.chart\.png$/ : /\.chart-no-grid\.png$/,
    );
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    images.push(
      await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        // Left edge of the chart, away from labels and horizontal grid lines.
        return [
          image.width,
          image.height,
          ...context.getImageData(54, 80, 1, 1).data,
          ...context.getImageData(60, 80, 1, 1).data,
        ];
      }, Buffer.concat(chunks).toString("base64")),
    );
  }
  expect(images[0].slice(0, 2)).toEqual(images[1].slice(0, 2));
  expect(images[0].slice(2, 6)).not.toEqual(images[0].slice(6, 10));
  expect(images[1].slice(2, 6)).toEqual(images[1].slice(6, 10));
  await expect(cell).toHaveAttribute("fill", originalColor!);
});

test("development samples are not production routes", async ({ request }) => {
  const response = await request.get("/stitch-samples/yarn");
  expect(response.status()).toBe(404);
  expect((await request.get("/e2e/harness")).status()).toBe(404);
  expect((await request.get("/yoke-designer")).status()).toBe(404);
  expect((await request.get("/yoke-designer/samples")).status()).toBe(404);
  expect((await request.get("/stitch-samples/yoke-shaping")).status()).toBe(
    404,
  );
});

test("chart dimensions allow typing intermediate values and reset on tab changes", async ({
  page,
}) => {
  await page.goto("/");
  const rows = page
    .locator('[data-tour="chart-size"]')
    .getByRole("spinbutton", { name: "Rows", exact: true });
  await rows.fill("1");
  await expect(rows).toHaveValue("1");
  await rows.pressSequentially("18");
  await expect(rows).toHaveValue("118");
  await page.getByRole("button", { name: "+ New chart", exact: true }).click();
  await expect(rows).toHaveValue("14");
});

for (const structural of [false, true]) {
  test(`stitch bitmap exports exact yarn pixels${structural ? " with explicit no-stitch handling" : " at 114 × 150"}`, async ({
    page,
  }) => {
    const doc = cloneDocument(defaultDocument);
    doc.width = 114;
    doc.height = 150;
    doc.palette = [
      { id: "pink", hex: "#ff809a" },
      { id: "green", hex: "#123456" },
    ];
    doc.cells = Array.from({ length: 150 }, (_, row) =>
      Array.from({ length: 114 }, (_, column) =>
        (row + column) % 3 === 0 ? "pink" : "green",
      ),
    );
    if (structural) {
      doc.stitchActions = createStitchActions(114, 150);
      doc.stitchActions[0][0] = "no-stitch";
      doc.stitchActions[0][1] = "m1l";
      doc.stitchColors = { m1l: "#abcdef" };
    }
    await page.addInitScript(
      (workspace) => {
        localStorage.setItem("colorwork-chart-v1", JSON.stringify(workspace));
      },
      workspaceSave([newChartTab(doc, "bitmap")], "bitmap"),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "File", exact: true }).click();
    const downloadEvent = structural ? null : page.waitForEvent("download");
    await page
      .getByRole("menuitem", {
        name: "Download stitch bitmap · 1 pixel per stitch",
        exact: true,
      })
      .click();
    let download;
    if (structural) {
      await expect(
        page.getByText(
          "Yarn colours only. Stitch actions and shaping are not included.",
          { exact: true },
        ),
      ).toBeVisible();
      const confirm = page.getByRole("menuitem", {
        name: "Download colour-only bitmap",
        exact: true,
      });
      await expect(confirm).toBeDisabled();
      await page.getByLabel("Fill no-stitch cells with").selectOption("green");
      const event = page.waitForEvent("download");
      await confirm.click();
      download = await event;
    } else {
      download = await downloadEvent!;
    }
    expect(download.suggestedFilename()).toMatch(/\.stitch-bitmap\.png$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const result = await page.evaluate(
      async ({ base64, structural }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data;
        let mismatches = 0;
        const colors = new Set<string>();
        for (let row = 0; row < image.height; row++) {
          for (let column = 0; column < image.width; column++) {
            const offset = (row * image.width + column) * 4;
            const actual = Array.from(pixels.slice(offset, offset + 4)).join(
              ",",
            );
            const pink =
              (row + column) % 3 === 0 &&
              !(structural && row === 0 && column === 0);
            if (actual !== (pink ? "255,128,154,255" : "18,52,86,255"))
              mismatches++;
            colors.add(actual);
          }
        }
        return {
          width: image.width,
          height: image.height,
          mismatches,
          colours: colors.size,
        };
      },
      { base64: Buffer.concat(chunks).toString("base64"), structural },
    );
    expect(result).toEqual({
      width: 114,
      height: 150,
      mismatches: 0,
      colours: 2,
    });
  });
}
