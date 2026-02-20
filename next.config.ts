import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Ensure proper asset handling
  assetPrefix: process.env.NODE_ENV === "production" ? "" : undefined,
};

export default nextConfig;
