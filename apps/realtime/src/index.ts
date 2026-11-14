import { getPrisma, tenantDb } from "@orbit/db";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { authenticate } from "./auth";
import { sendDueReminders } from "./reminders";
import { createRealtimeServer } from "./server";
import { dropFormerMembers, membershipKey } from "./sweep";

const port = Number(process.env.REALTIME_PORT ?? 4000);
const corsOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((origin) => origin.trim());

const { http, io } = createRealtimeServer({
  authenticate,
  corsOrigin,
  listChannelIds: async ({ workspaceId, userId }) => {
    const rows = await tenantDb(workspaceId).channelMember.findMany({ where: { userId }, select: { channelId: true } });
    return rows.map((row) => row.channelId);
  },
});

// Redis pub/sub lets several realtime instances share rooms. Optional for a
// single local instance, required as soon as there is more than one.
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pub = new Redis(redisUrl, { lazyConnect: true });
  const sub = pub.duplicate();
  pub.on("error", (error) => console.error("[realtime] redis", error.message));
  sub.on("error", (error) => console.error("[realtime] redis", error.message));
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  console.log("[realtime] using Redis adapter");
} else {
  console.warn("[realtime] REDIS_URL not set: using the in-memory adapter (single instance only)");
}

http.listen(port, () => console.log(`[realtime] listening on :${port}`));

const reminders = setInterval(() => {
  sendDueReminders(io).catch((error) => console.error("[realtime] reminders failed", error));
}, 60_000);
reminders.unref();

// People removed from a workspace lose their live connection within half a minute. This spans every
// workspace, so it uses the unscoped client on purpose: it only asks "does this exact membership still exist?".
const sweep = setInterval(() => {
  dropFormerMembers(io, async (pairs) => {
    const rows = await getPrisma().membership.findMany({ where: { OR: pairs }, select: { workspaceId: true, userId: true } });
    return new Set(rows.map((row) => membershipKey(row.workspaceId, row.userId)));
  }).catch((error) => console.error("[realtime] membership sweep failed", error));
}, 30_000);
sweep.unref();

const shutdown = () => {
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
