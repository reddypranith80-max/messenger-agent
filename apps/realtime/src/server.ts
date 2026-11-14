import { createServer, type Server as HttpServer } from "node:http";
import type { ClientToServerEvents, ServerToClientEvents } from "@orbit/db/chat-types";
import { Server, type Socket } from "socket.io";
import { HandshakeError, type Authenticator, type SocketIdentity } from "./auth";
import { registerChatHandlers } from "./handlers";

type SocketData = { identity: SocketIdentity };

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const workspaceRoom = (workspaceId: string) => `ws:${workspaceId}`;
export const userRoom = (workspaceId: string, userId: string) => `ws:${workspaceId}:user:${userId}`;
export const channelRoom = (channelId: string) => `ch:${channelId}`;

export function createRealtimeServer(options: {
  authenticate: Authenticator;
  corsOrigin: string | string[];
  /** Channels a user is in, to subscribe their socket on connect. */
  listChannelIds?: (identity: SocketIdentity) => Promise<string[]>;
}): { http: HttpServer; io: RealtimeServer } {
  const http = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: RealtimeServer = new Server(http, {
    cors: { origin: options.corsOrigin, credentials: true },
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      socket.data.identity = await options.authenticate(socket.handshake.auth);
      next();
    } catch (error) {
      if (!(error instanceof HandshakeError)) console.error("[realtime] handshake failed", error);
      next(new Error(error instanceof HandshakeError ? error.message : "unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const identity = socket.data.identity;
    const { userId, workspaceId, name } = identity;
    const personal = userRoom(workspaceId, userId);

    // Listeners first. A client can send its first event the moment it connects,
    // and events that arrive before a listener exists are dropped, not queued.
    registerChatHandlers(io, socket);
    socket.on("disconnect", async () => {
      try {
        // Only announce "left" when the user's last tab or device disconnects.
        const remaining = await io.in(personal).fetchSockets();
        if (remaining.length === 0) io.to(workspaceRoom(workspaceId)).emit("presence:left", { userId });
      } catch (error) {
        console.error("[realtime] presence update failed", error);
      }
    });

    try {
      // Rooms are always derived from the verified identity and the user's
      // memberships, never from client input.
      const channelIds = (await options.listChannelIds?.(identity)) ?? [];
      await socket.join([workspaceRoom(workspaceId), personal, ...channelIds.map(channelRoom)]);
      if (!socket.connected) return; // gone while we were looking things up

      const online = new Set((await io.in(workspaceRoom(workspaceId)).fetchSockets()).map((s) => s.data.identity.userId));
      socket.emit("presence:sync", { online: [...online] });
      socket.to(workspaceRoom(workspaceId)).emit("presence:joined", { userId, name });
    } catch (error) {
      // Without its rooms the socket would look connected but receive nothing: drop it so the client reconnects.
      console.error("[realtime] could not set up a connection", error);
      socket.disconnect(true);
    }
  });

  return { http, io };
}
