import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HandshakeError, handshakeSchema, type Authenticator, type SocketIdentity } from "./auth";
import { createRealtimeServer } from "./server";

// A stand-in for Clerk + database lookups: token "<user>@<workspace>" is a
// member of exactly that workspace.
const fakeAuth: Authenticator = async (raw) => {
  const parsed = handshakeSchema.safeParse(raw);
  if (!parsed.success) throw new HandshakeError("bad_request");
  const [userId, memberOf] = parsed.data.token.split("@");
  if (!userId || !memberOf) throw new HandshakeError("unauthorized");
  if (memberOf !== parsed.data.workspaceId) throw new HandshakeError("forbidden");
  return { userId, workspaceId: memberOf, role: "MEMBER", name: userId } satisfies SocketIdentity;
};

const { http, io } = createRealtimeServer({ authenticate: fakeAuth, corsOrigin: "*" });
let url = "";
const sockets: Socket[] = [];

function client(auth: Record<string, unknown>): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { auth, transports: ["websocket"], reconnection: false, forceNew: true });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => reject(error));
  });
}

const nextEvent = <T,>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

beforeAll(async () => {
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await io.close();
});

describe("realtime handshake", () => {
  it("rejects a connection with no credentials", async () => {
    await expect(client({})).rejects.toThrow("bad_request");
  });

  it("rejects an invalid token", async () => {
    await expect(client({ token: "garbage", workspaceId: "ws_a" })).rejects.toThrow("unauthorized");
  });

  it("rejects a valid user asking for a workspace they are not in", async () => {
    await expect(client({ token: "alice@ws_a", workspaceId: "ws_b" })).rejects.toThrow("forbidden");
  });

  it("serves a health check", async () => {
    const response = await fetch(`${url}/healthz`);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("realtime tenant isolation", () => {
  it("delivers presence to the same workspace and never to another", async () => {
    const alice = await client({ token: "alice@ws_a", workspaceId: "ws_a" });
    const eve = await client({ token: "eve@ws_b", workspaceId: "ws_b" });

    const leaked: unknown[] = [];
    eve.onAny((event, payload) => leaked.push({ event, payload }));

    const joined = nextEvent<{ userId: string }>(alice, "presence:joined");
    const bob = await client({ token: "bob@ws_a", workspaceId: "ws_a" });
    expect((await joined).userId).toBe("bob");

    const left = nextEvent<{ userId: string }>(alice, "presence:left");
    bob.disconnect();
    expect((await left).userId).toBe("bob");

    await settle();
    expect(leaked).toEqual([]);
  });

  it("puts a socket only in rooms of its own workspace", async () => {
    await client({ token: "carol@ws_c", workspaceId: "ws_c" });
    const [server] = await io.in("ws:ws_c").fetchSockets();
    expect([...server!.rooms].filter((room) => room !== server!.id).sort()).toEqual(["ws:ws_c", "ws:ws_c:user:carol"]);
  });

  it("announces left only when the user's last connection closes", async () => {
    const watcher = await client({ token: "dan@ws_d", workspaceId: "ws_d" });
    const first = await client({ token: "erin@ws_d", workspaceId: "ws_d" });
    const second = await client({ token: "erin@ws_d", workspaceId: "ws_d" });

    const events: string[] = [];
    watcher.on("presence:left", ({ userId }: { userId: string }) => events.push(userId));

    first.disconnect();
    await settle();
    expect(events).toEqual([]);

    second.disconnect();
    await settle();
    expect(events).toEqual(["erin"]);
  });
});

describe("connection setup", () => {
  async function serverWith(listChannelIds: () => Promise<string[]>) {
    const extra = createRealtimeServer({ authenticate: fakeAuth, corsOrigin: "*", listChannelIds });
    await new Promise<void>((resolve) => extra.http.listen(0, resolve));
    const socket = connect(`http://localhost:${(extra.http.address() as AddressInfo).port}`, {
      auth: { token: "zed@ws_z", workspaceId: "ws_z" },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return { extra, socket };
  }

  it("answers an event sent the instant the socket connects, while its rooms are still loading", async () => {
    const { extra, socket } = await serverWith(() => new Promise((resolve) => setTimeout(() => resolve([]), 300)));
    const reply = await new Promise((resolve, reject) => {
      socket.once("connect_error", reject);
      socket.once("connect", () => {
        // Not a valid message, so the handler answers without touching the database.
        socket.timeout(2000).emit("message:send", {}, (error: Error | null, result: unknown) => (error ? reject(error) : resolve(result)));
      });
    });
    expect(reply).toEqual({ ok: false, error: "That request was not valid." });
    await extra.io.close();
  });

  it("drops a connection whose rooms cannot be loaded, without crashing the service", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { extra, socket } = await serverWith(async () => {
      throw new Error("database is down");
    });
    const reason = await new Promise((resolve) => socket.once("disconnect", resolve));
    expect(reason).toBe("io server disconnect");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    await extra.io.close();
  });
});

describe("membership sweep", () => {
  it("disconnects sockets whose membership has ended and leaves the rest alone", async () => {
    const { dropFormerMembers, membershipKey } = await import("./sweep");
    const stays = await client({ token: "fay@ws_s", workspaceId: "ws_s" });
    const removed = await client({ token: "gus@ws_s", workspaceId: "ws_s" });
    const gone = new Promise((resolve) => removed.once("disconnect", resolve));

    const dropped = await dropFormerMembers(io, async (pairs) => {
      // Every membership still exists except gus's in ws_s.
      return new Set(pairs.filter((p) => !(p.userId === "gus" && p.workspaceId === "ws_s")).map((p) => membershipKey(p.workspaceId, p.userId)));
    });

    expect(dropped).toBe(1);
    expect(await gone).toBe("io server disconnect");
    expect(stays.connected).toBe(true);
    // The removed person no longer receives anything sent to the workspace.
    const leaked: unknown[] = [];
    removed.onAny((event) => leaked.push(event));
    io.to("ws:ws_s").emit("presence:left", { userId: "someone" });
    await settle();
    expect(leaked).toEqual([]);
  });
});
