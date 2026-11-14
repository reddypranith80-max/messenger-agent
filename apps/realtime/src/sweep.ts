import type { RealtimeServer } from "./server";

/** Returns the "<workspaceId>:<userId>" pairs, out of those given, that are still memberships. */
export type MembershipCheck = (pairs: { workspaceId: string; userId: string }[]) => Promise<Set<string>>;

export const membershipKey = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;

/**
 * A socket proves membership once, when it connects. If the person is removed
 * from the workspace (or leaves) while a tab stays open, that socket would keep
 * receiving the workspace's messages. This disconnects such sockets; run it on
 * a timer. Returns how many were dropped.
 */
export async function dropFormerMembers(io: RealtimeServer, stillMembers: MembershipCheck): Promise<number> {
  const sockets = [...io.of("/").sockets.values()];
  if (sockets.length === 0) return 0;
  const pairs = new Map<string, { workspaceId: string; userId: string }>();
  for (const socket of sockets) {
    const { workspaceId, userId } = socket.data.identity;
    pairs.set(membershipKey(workspaceId, userId), { workspaceId, userId });
  }
  const valid = await stillMembers([...pairs.values()]);
  let dropped = 0;
  for (const socket of sockets) {
    const { workspaceId, userId } = socket.data.identity;
    if (valid.has(membershipKey(workspaceId, userId))) continue;
    socket.disconnect(true);
    dropped++;
  }
  return dropped;
}
