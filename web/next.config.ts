import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to the PullEV monorepo root (contains /web and /shared).
  // Without this, Turbopack may infer a stray parent dir as the root (multiple lockfiles).
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  // Real Renaiss card art lives on these blob hosts. Allowlisting them lets next/image
  // resize + serve WebP via Vercel's image CDN, so card images load fast (the raw PNGs
  // are large and slow). Identification use only; IP belongs to the respective owners.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "bhshyxmgzwogzgcf.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "8nothtoc5ds7a0x3.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
