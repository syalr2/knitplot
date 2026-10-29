import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { defaultDocument } from "../lib/chart";
import {
  newChartTab,
  tabPayload,
  tabSnapshot,
  workspaceSave,
  type WorkspaceSave,
} from "../lib/workspace";

test.setTimeout(90_000);
const id = "a21d4c9a-1122-4234-8234-123456789abc";
const origin = "http://127.0.0.1:3109";
const key = "colorwork-chart-v1";
const initial = tabPayload(
  newChartTab({ ...defaultDocument, name: "Original" }, "local"),
);

/** In-memory cloud shared only by the contexts in one test. No real API calls. */
function cloud() {
  return {
    data: structuredClone(initial),
    version: 1,
    writes: [] as number[],
    reads: 0,
    offline: false,
    failReads: false,
    loseReply: false,
    hold: undefined as Promise<void> | undefined,
    async attach(context: BrowserContext) {
      await context.route("**/api/**", async (route) => {
        const request = route.request();
        if (new URL(request.url()).pathname !== `/api/charts/${id}`)
          return route.fulfill({
            status: 503,
            json: { error: "Unmocked test request" },
          });
        if (this.offline || (this.failReads && request.method() === "GET"))
          return route.abort("internetdisconnected");
        if (request.method() === "GET") {
          this.reads++;
          return route.fulfill({
            json: { id, version: this.version, ...this.data },
          });
        }
        if (request.method() !== "PUT") return route.fulfill({ status: 405 });
        const { expectedVersion, ...payload } = request.postDataJSON();
        this.writes.push(expectedVersion);
        if (this.hold) await this.hold;
        if (expectedVersion !== this.version)
          return route.fulfill({
            status: 409,
            json: { error: "Changed elsewhere" },
          });
        this.data = payload;
        this.version++;
        if (this.loseReply) {
          this.loseReply = false;
          return route.abort("failed");
        }
        return route.fulfill({ json: { id, version: this.version } });
      });
    },
    changeElsewhere() {
      this.data.document.name = "Cloud version";
      this.version++;
    },
  };
}

async function seed(context: BrowserContext, count = 1) {
  const tab = {
    id: "local",
    cloudId: id,
    cloudVersion: "1",
    ...structuredClone(initial),
    cloudSnapshot: tabSnapshot(initial),
  };
  const workspace = workspaceSave(
    [
      tab,
      ...Array.from({ length: count - 1 }, (_, i) =>
        newChartTab(defaultDocument, `extra-${i}`),
      ),
    ],
    "local",
  );
  await context.addInitScript(
    ({ key, workspace }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(workspace));
      localStorage.setItem("knitplot-tutorial-v1", "seen");
      const original = Storage.prototype.setItem;
      let full = false;
      window.addEventListener("test-storage-full", (event) => {
        full = (event as CustomEvent).detail;
      });
      Storage.prototype.setItem = function (name, value) {
        if (full && name === key)
          throw new DOMException("Storage full", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    { key, workspace },
  );
}
const name = (page: Page) => page.getByRole("textbox", { name: "Chart name" });
async function saved(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as WorkspaceSave,
    key,
  );
}
async function edit(page: Page, title: string) {
  await name(page).fill(title);
  await page.getByRole("button", { name: "Use colour 3", exact: true }).click();
  await page.locator(".chart-svg > g:first-child > rect").nth(100).click();
}
async function start(
  page: Page,
  context: BrowserContext,
  server: ReturnType<typeof cloud>,
  count = 1,
) {
  await server.attach(context);
  await seed(context, count);
  await page.goto(origin);
  await expect(name(page)).toHaveValue("Original");
}

test("two independent windows cannot overwrite the same cloud revision", async ({
  page,
  context,
  browser,
}) => {
  const server = cloud();
  await start(page, context, server);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await start(other, otherContext, server);
    await edit(page, "First window");
    await expect.poll(() => server.version).toBe(2);
    await edit(other, "Second window");
    await expect(
      other.getByRole("button", { name: "Load cloud version", exact: true }),
    ).toBeVisible();
    expect(server.data.document.name).toBe("First window");
    await expect(name(other)).toHaveValue("Second window");
    expect((await saved(other)).tabs[0].document.name).toBe("Second window");
  } finally {
    await otherContext.close();
  }
});

test("same-browser windows warn before overwriting each other's browser workspace", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server);
  const other = await context.newPage();
  await other.goto(origin);
  await expect(name(other)).toHaveValue("Original");
  await edit(page, "First window");
  await expect(
    other
      .getByRole("alert")
      .filter({ hasText: "workspace changed in another window" }),
  ).toBeVisible();
  await name(other).fill("Second window local edits");
  await expect
    .poll(async () => (await saved(page)).tabs[0].document.name)
    .toBe("First window");
  await expect(name(other)).toHaveValue("Second window local edits");
});

test("network failure keeps local edits and retry saves after reconnection", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server);
  server.offline = true;
  await edit(page, "Offline edits");
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  expect((await saved(page)).tabs[0].document.name).toBe("Offline edits");
  expect(server.version).toBe(1);
  server.offline = false;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect.poll(() => server.version).toBe(2);
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toHaveCount(0);
  expect(server.data.document.name).toBe("Offline edits");
});

test("a lost success response reconciles without a false conflict or duplicate write", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server);
  server.loseReply = true;
  await edit(page, "Saved but reply lost");
  await expect(
    page.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeVisible();
  expect(server.version).toBe(2);
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).tabs[0].cloudVersion)
    .toBe("2");
  await expect(
    page.getByRole("button", { name: "Load cloud version", exact: true }),
  ).toHaveCount(0);
  expect(server.version).toBe(2);
  expect(server.reads).toBe(1);
});

test("edits made while a save is in flight use its returned revision", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server);
  let release!: () => void;
  server.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await name(page).fill("First edit");
    await expect.poll(() => server.writes.length).toBe(1);
    await edit(page, "Latest edit");
  } finally {
    release();
    server.hold = undefined;
  }
  await expect.poll(() => server.version).toBe(3);
  expect(server.writes).toEqual([1, 2]);
  expect(server.data.document.name).toBe("Latest edit");
});

test("failed recovery preserves work; successful recovery keeps both copies independently editable", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server);
  server.changeElsewhere();
  await edit(page, "Local drawing");
  const load = page.getByRole("button", {
    name: "Load cloud version",
    exact: true,
  });
  await expect(load).toBeVisible();
  const before = await saved(page);
  server.failReads = true;
  await load.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load the cloud version" }),
  ).toBeVisible();
  expect(await saved(page)).toEqual(before);
  server.failReads = false;
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-storage-full", { detail: true }),
    ),
  );
  await load.click();
  await expect(load).toBeEnabled();
  await expect(name(page)).toHaveValue("Local drawing");
  expect(await saved(page)).toEqual(before);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-storage-full", { detail: false }),
    ),
  );
  await load.click();
  await expect(name(page)).toHaveValue("Cloud version");
  const recovered = await saved(page);
  expect(recovered.tabs).toHaveLength(2);
  expect(recovered.tabs[0].cloudId).toBeUndefined();
  expect(recovered.tabs[0].document.cells).toEqual(
    before.tabs[0].document.cells,
  );
  await page.reload();
  await expect(name(page)).toHaveValue("Cloud version");
  await page
    .getByRole("tab", { name: "Local drawing (local copy)", exact: true })
    .click();
  await name(page).fill("Independent local copy");
  await expect
    .poll(async () => (await saved(page)).tabs[0].document.name)
    .toBe("Independent local copy");
  // Observe a full autosave debounce window to prove detached work does not write remotely.
  const writes = server.writes.length;
  await page.waitForTimeout(1500);
  expect(server.writes).toHaveLength(writes);
  expect(server.data.document.name).toBe("Cloud version");
  await page.getByRole("tab", { name: "Cloud version", exact: true }).click();
  await name(page).fill("New cloud edit");
  await expect.poll(() => server.version).toBe(3);
  expect(server.data.document.name).toBe("New cloud edit");
});

test("a full eight-tab workspace refuses recovery without discarding a chart", async ({
  page,
  context,
}) => {
  const server = cloud();
  await start(page, context, server, 8);
  server.changeElsewhere();
  await edit(page, "Keep all eight");
  const load = page.getByRole("button", {
    name: "Load cloud version",
    exact: true,
  });
  await expect(load).toBeVisible();
  const before = await saved(page);
  const reads = server.reads;
  await load.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Close one chart tab first" }),
  ).toBeVisible();
  expect(await saved(page)).toEqual(before);
  expect(server.reads).toBe(reads);
});
