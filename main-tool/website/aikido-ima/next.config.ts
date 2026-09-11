import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "pg"],
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;
