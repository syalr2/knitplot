import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
};
export default config;
