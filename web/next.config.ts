import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to the PullEV monorepo root (contains /web and /shared).
  // Without this, Turbopack may infer a stray parent dir as the root (multiple lockfiles).
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
