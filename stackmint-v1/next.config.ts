import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "glowing-parakeet-7jqvjqg9xvpcpg5-3000.app.github.dev",
        "127.0.0.1",
        "127.0.0.1:3000",
        "127.0.0.1:8000",
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
