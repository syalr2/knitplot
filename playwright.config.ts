import { defineConfig, devices } from "@playwright/test";

const isolatedEnvironment = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
  CLERK_SECRET_KEY: "",
  DATABASE_URL: "",
  OPENAI_API_KEY: "",
  OPENAI_KEY_ENCRYPTION_SECRET: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3108",
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      testMatch: "editor.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "saving",
      testMatch: "saving.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3109" },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3108",
      url: "http://127.0.0.1:3108",
      reuseExistingServer: false,
      env: isolatedEnvironment,
    },
    {
      command: "npx next dev e2e/harness --hostname 127.0.0.1 --port 3109",
      url: "http://127.0.0.1:3109",
      reuseExistingServer: false,
      timeout: 120_000,
      env: isolatedEnvironment,
    },
  ],
});
