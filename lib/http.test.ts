import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError, readJsonObject, responseJson } from "./http";
test("null, arrays and malformed JSON are bad requests", async () => {
  for (const body of ["null", "[]", "{"])
    await assert.rejects(
      readJsonObject(
        new Request("https://example.test", { method: "POST", body }),
      ),
      HttpError,
    );
});
test("platform HTML errors do not leak JSON parser errors", async () => {
  await assert.rejects(
    responseJson(new Response("<html>too large</html>", { status: 413 })),
    /too large/,
  );
});
test("JSON API errors preserve their HTTP status", async () => {
  await assert.rejects(
    responseJson(
      Response.json({ error: "changed elsewhere" }, { status: 409 }),
    ),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );
});
