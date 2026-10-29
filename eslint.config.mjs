import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

export default defineConfig([
  ...next,
  ...typescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["app/account/page.tsx"],
    rules: {
      // A full navigation refreshes server-side OpenAI connection state after
      // connecting/disconnecting a key; a cached client route can be stale.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    ".vercel/**",
    "next-env.d.ts",
    "public/**",
  ]),
]);
