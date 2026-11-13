import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// One .env at the repo root is shared by every app and package.
const rootEnv = path.resolve(import.meta.dirname, "../../.env");
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` runs on install, before a database is configured.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
