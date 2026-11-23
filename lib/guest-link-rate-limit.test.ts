import assert from "node:assert/strict";
import { test } from "node:test";
import { limitGuestLink } from "./guest-link-rate-limit";
import { HttpError } from "./http";

test("guest link rate buckets use only the trusted Vercel address and no raw IP", async () => {
  const before = {
    vercel: process.env.VERCEL,
    secret: process.env.KNITPLOT_LINK_RATE_SECRET,
  };
  const calls: unknown[][] = [];
  let allowed = true;
  const sql = (async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(values);
    return [{ allowed }];
  }) as unknown as Parameters<typeof limitGuestLink>[1];
  const request = (spoofed: string) =>
    new Request("https://knitplot.test/api/chart-links", {
      headers: {
        "x-forwarded-for": spoofed,
        "x-vercel-forwarded-for": "192.0.2.1",
      },
    });
  try {
    delete process.env.VERCEL;
    await limitGuestLink(request("192.0.2.2"), sql, "create");
    assert.equal(calls.length, 0);
    process.env.VERCEL = "1";
    delete process.env.KNITPLOT_LINK_RATE_SECRET;
    await assert.rejects(limitGuestLink(request("192.0.2.2"), sql, "create"), {
      status: 503,
    });
    process.env.KNITPLOT_LINK_RATE_SECRET = "test-not-an-actual-secret".repeat(
      2,
    );
    await limitGuestLink(request("192.0.2.2"), sql, "create");
    await limitGuestLink(request("192.0.2.3"), sql, "create");
    assert.deepEqual(calls[0], calls[1]);
    assert.match(String(calls[0][0]), /^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(calls), /192\.0\.2/);
    allowed = false;
    await assert.rejects(
      limitGuestLink(request("192.0.2.2"), sql, "open"),
      (error) => error instanceof HttpError && error.status === 429,
    );
    assert.notEqual(calls[0][0], calls[2][0]);
  } finally {
    if (before.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = before.vercel;
    if (before.secret === undefined)
      delete process.env.KNITPLOT_LINK_RATE_SECRET;
    else process.env.KNITPLOT_LINK_RATE_SECRET = before.secret;
  }
});
