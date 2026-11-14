// Local development database: a real PostgreSQL server (no Docker, no install).
// Data lives in <repo>/.data/postgres and survives restarts. Stop it with Ctrl+C.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DB = "orbit";
const dir = path.resolve(import.meta.dirname, "../../../.data/postgres");
mkdirSync(path.dirname(dir), { recursive: true });

const server = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true,
  // Without these, Windows creates the cluster in its legacy code page (WIN1252), which cannot store emoji.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (message) => console.error(String(message).trim()),
});

if (!existsSync(path.join(dir, "PG_VERSION"))) {
  console.log("Creating a new local database cluster (first run only)...");
  await server.initialise();
}
await server.start();
try {
  await server.createDatabase(DB);
} catch {
  // already exists
}

console.log(`\nPostgres is running. Put this in .env:\n\nDATABASE_URL="postgres://postgres:postgres@localhost:${PORT}/${DB}"\n\nPress Ctrl+C to stop.`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30); // keep the process alive
