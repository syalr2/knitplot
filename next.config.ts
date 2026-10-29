import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Sample pages have a development-only extension: they are not production routes.
  pageExtensions:
    process.env.NODE_ENV === "development"
      ? ["dev.tsx", "tsx", "ts", "jsx", "js"]
      : ["tsx", "ts", "jsx", "js"],
};

export default nextConfig;
