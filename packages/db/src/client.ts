import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { __orbitPrisma?: PrismaClient };

/**
 * Unscoped client. Use it only for global models (User, Workspace) and for
 * resolving which workspace a request belongs to. Everything else goes
 * through `tenantDb(workspaceId)`.
 */
export function getPrisma(): PrismaClient {
  return (globalForPrisma.__orbitPrisma ??= create());
}

/** Lazy proxy so importing this module never opens a connection or needs env. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
