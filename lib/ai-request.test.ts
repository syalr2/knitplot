import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateRequestSchema,
  editRequestSchema,
  readAiRequest,
} from "./ai-request";
const settings = {
  prompt: "a bear",
  width: 18,
  height: 14,
  colorCount: 3,
  chartAspect: 1.2,
};
test("AI generation uses the user's dimensions, including large charts", () => {
  assert.equal(
    readAiRequest(generateRequestSchema, {
      ...settings,
      width: 200,
      height: 150,
    }).width,
    200,
  );
});
test("both AI routes reject null and invalid colour ranges", () => {
  for (const schema of [generateRequestSchema, editRequestSchema]) {
    assert.equal(schema.safeParse(null).success, false);
    assert.equal(
      schema.safeParse({
        ...settings,
        colorMode: "range",
        minimumColors: 5,
        maximumColors: 2,
      }).success,
      false,
    );
  }
});
test("oversized and malformed reference images fail before OpenAI is called", () => {
  for (const referenceImage of ["a".repeat(3_000_001), "not base64!"]) {
    assert.equal(
      generateRequestSchema.safeParse({ ...settings, referenceImage }).success,
      false,
    );
  }
});
