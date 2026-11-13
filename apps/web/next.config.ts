import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// One .env at the repo root is shared by every app and package. Variables
// already present in the environment (for example on a host) win.
const repoRoot = path.resolve(import.meta.dirname, "../..");
const rootEnv = path.join(repoRoot, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  transpilePackages: ["@orbit/db", "@orbit/ui"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.clerk.com" }],
  },
};

export default nextConfig;
