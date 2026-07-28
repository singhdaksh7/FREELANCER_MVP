import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Turbopack doesn't infer it from
  // an unrelated lockfile higher up the filesystem tree.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
