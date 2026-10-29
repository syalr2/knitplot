import { test, expect } from "@playwright/test";

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

test("missing Clerk configuration never grants private chart access", async ({
  request,
}) => {
  const response = await request.get(
    "/api/charts/a21d4c9a-1122-4234-8234-123456789abc",
  );
  expect(response.status()).toBe(401);
});

test("development samples are not production routes", async ({ request }) => {
  const response = await request.get("/stitch-samples/yarn");
  expect(response.status()).toBe(404);
  expect((await request.get("/e2e/harness")).status()).toBe(404);
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
