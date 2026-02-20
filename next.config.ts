import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly use webpack, not Turbopack
  // No experimental.turbo config means webpack is used
};

export default nextConfig;
