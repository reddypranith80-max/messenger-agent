import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export type LiveKitConfig = { url: string; httpUrl: string; key: string; secret: string };

/** Null until real LiveKit credentials are in .env (the .env.example placeholders do not count). */
export function livekitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  if ([url, key, secret].some((v) => v.includes("xxx"))) return null;
  return { url, httpUrl: url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret };
}

export type RoomKind = "channel" | "meeting";

/** One LiveKit room per conversation or meeting, namespaced by workspace so ids can never collide across tenants. */
export const roomName = (workspaceId: string, kind: RoomKind, id: string) => `${workspaceId}:${kind === "channel" ? "ch" : "mt"}:${id}`;

export async function mintToken(config: LiveKitConfig, input: { room: string; identity: string; name: string }): Promise<string> {
  const token = new AccessToken(config.key, config.secret, { identity: input.identity, name: input.name, ttl: "4h" });
  token.addGrant({
    roomJoin: true,
    room: input.room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true, // raise hand
  });
  return token.toJwt();
}

/** Participant counts of the workspace's rooms that have someone in them, keyed by room name. */
export async function activeRooms(config: LiveKitConfig, workspaceId: string): Promise<Record<string, number>> {
  try {
    const client = new RoomServiceClient(config.httpUrl, config.key, config.secret);
    const rooms = await client.listRooms();
    return Object.fromEntries(rooms.filter((r) => r.name.startsWith(`${workspaceId}:`) && r.numParticipants > 0).map((r) => [r.name, r.numParticipants]));
  } catch (error) {
    console.error("[livekit] could not list rooms:", (error as Error).message);
    return {};
  }
}
