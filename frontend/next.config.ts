import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Unsplash URLs are already sized via query params; serve them directly so
    // the optimizer can't fail on certain device sizes (fixes broken images on mobile).
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
