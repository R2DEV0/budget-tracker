import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use Turbopack in development
  ...(process.env.NODE_ENV === "development" ? { turbopack: {} } : {}),
};

export default nextConfig;
