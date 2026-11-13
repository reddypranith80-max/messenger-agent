import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { HandshakeError, type Authenticator, type SocketIdentity } from "./auth";

export type ServerToClientEvents = {
  "presence:joined": (payload: { userId: string; name: string }) => void;
  "presence:left": (payload: { userId: string }) => void;
};
// Chat events are added in phase 2.
export type ClientToServerEvents = Record<string, never>;
type SocketData = { identity: SocketIdentity };

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export const workspaceRoom = (workspaceId: string) => `ws:${workspaceId}`;
export const userRoom = (workspaceId: string, userId: string) => `ws:${workspaceId}:user:${userId}`;

export function createRealtimeServer(options: { authenticate: Authenticator; corsOrigin: string | string[] }): {
  http: HttpServer;
  io: RealtimeServer;
} {
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
    const { userId, workspaceId, name } = socket.data.identity;
    const personal = userRoom(workspaceId, userId);
    // Rooms are always derived from the verified identity, never from client input.
    await socket.join([workspaceRoom(workspaceId), personal]);
    socket.to(workspaceRoom(workspaceId)).emit("presence:joined", { userId, name });

    socket.on("disconnect", async () => {
      // Only announce "left" when the user's last tab or device disconnects.
      const remaining = await io.in(personal).fetchSockets();
      if (remaining.length === 0) io.to(workspaceRoom(workspaceId)).emit("presence:left", { userId });
    });
  });

  return { http, io };
}
