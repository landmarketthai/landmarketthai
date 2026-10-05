import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/land-insights", destination: "/search", permanent: true }];
  },
  eslint: {
    // ESLint runs in CI; skip during next build to avoid config serialization issue
    ignoreDuringBuilds: true,
  },
  // src/lib/thai-admin.ts reads these with fs at runtime; make sure they ship with the route.
  outputFileTracingIncludes: {
    "/api/thai-admin": ["./src/data/thailand-flat.json", "./src/data/thailand-admin.json"],
    "/land": ["./src/data/thailand-flat.json", "./src/data/thailand-admin.json"],
    "/search": ["./src/data/thailand-flat.json", "./src/data/thailand-admin.json"],
    "/land/[province]": ["./src/data/thailand-flat.json", "./src/data/thailand-admin.json"],
    "/land/[province]/[type]": ["./src/data/thailand-flat.json", "./src/data/thailand-admin.json"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.digitaloceanspaces.com",
      },
      {
        protocol: "https",
        hostname: "**.cdn.digitaloceanspaces.com",
      },
      {
        // Google OAuth avatar images
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
