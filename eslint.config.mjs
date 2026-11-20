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
      // A full navigation reloads the editor with current account information.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "node_modules/**",
    ".vercel/**",
    "next-env.d.ts",
    "public/**",
  ]),
]);
