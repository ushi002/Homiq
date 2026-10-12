import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Never answer "/path/" with a permanent 308 redirect: browsers cache it for good, and while the
  // backend restarts the frontend also receives /api/... requests (a cached /api/buildings/ ->
  // /api/buildings redirect broke the building list in one browser).
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
