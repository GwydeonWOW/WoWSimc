import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "render.worldofwarcraft.com",
      },
      {
        protocol: "https",
        hostname: "render-us.worldofwarcraft.com",
      },
      {
        protocol: "https",
        hostname: "render-eu.worldofwarcraft.com",
      },
      {
        protocol: "https",
        hostname: "static.murlok.io",
      },
      {
        protocol: "https",
        hostname: "assets.rpglogs.com",
      },
    ],
  },
};

export default nextConfig;
