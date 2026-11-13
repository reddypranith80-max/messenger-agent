import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootEnv = path.resolve(import.meta.dirname, "../../.env");
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], fileParallelism: false },
});
