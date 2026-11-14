import {
  ChatError,
  createChannel,
  decideAdmission,
  deleteMessage,
  editMessage,
  joinChannel,
  knock,
  logCall,
  markRead,
  openDm,
  sendMessage,
  tenantDb,
  toggleReaction,
  type Ack,
  type ChannelDTO,
  type MessageDTO,
} from "@orbit/db";
import { z } from "zod";
import { channelRoom, userRoom, type RealtimeServer, type RealtimeSocket } from "./server";

const id = z.string().min(1).max(64);
const schemas = {
  send: z.object({ channelId: id, body: z.string().max(10_000), parentId: id.nullish() }),
  edit: z.object({ id, body: z.string().max(10_000) }),
  remove: z.object({ id }),
  react: z.object({ messageId: id, emoji: z.string().min(1).max(16) }),
  read: z.object({ channelId: id }),
  create: z.object({
    name: z.string().max(100),
    topic: z.string().max(200).optional(),
    isPrivate: z.boolean(),
    memberIds: z.array(id).max(200),
  }),
  join: z.object({ channelId: id }),
  dm: z.object({ userIds: z.array(id).max(20) }),
  typing: z.object({ channelId: id, on: z.boolean() }),
  call: z.object({ channelId: id }),
  knock: z.object({ meetingId: id }),
  decide: z.object({ meetingId: id, userId: id, admit: z.boolean() }),
};

/** Allow `limit` events per `windowMs` for one socket. */
function createLimiter(limit: number, windowMs: number) {
  let hits: number[] = [];
  return () => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < windowMs);
    if (hits.length >= limit) return false;
    hits.push(now);
    return true;
  };
}

function describe(error: unknown): string {
  if (error instanceof ChatError) return error.message;
  if (error instanceof z.ZodError) return "That request was not valid.";
  console.error("[realtime] handler failed", error);
  return "Something went wrong. Please try again.";
}

/** Run `work`, reply through the client's ack callback, never throw. */
async function respond<T>(ack: unknown, work: () => Promise<T>): Promise<void> {
  const reply = typeof ack === "function" ? (ack as (result: Ack<T>) => void) : () => {};
  try {
    reply({ ok: true, data: await work() });
  } catch (error) {
    reply({ ok: false, error: describe(error) });
  }
}

export function registerChatHandlers(io: RealtimeServer, socket: RealtimeSocket): void {
  const { userId, workspaceId, role, name } = socket.data.identity;
  const db = () => tenantDb(workspaceId);
  const actor = { userId, role };
  const allow = createLimiter(40, 10_000);
  const throttled = () => {
    if (!allow()) throw new ChatError("rate_limited", "You are sending too fast. Slow down a little.");
  };

  /** Put every socket of these users into the channel room and tell them about it. */
  const subscribeUsers = (channel: ChannelDTO, userIds: string[]) => {
    for (const memberId of userIds) {
      io.in(userRoom(workspaceId, memberId)).socketsJoin(channelRoom(channel.id));
      io.to(userRoom(workspaceId, memberId)).emit("channel:added", channel);
    }
  };

  /** Tell the people a message is about: those it mentions, and the author of the message it replies to. */
  const notifyActivity = async (message: MessageDTO) => {
    const targets = new Map<string, "mention" | "reply">();
    if (message.parentId) {
      const parent = await db().message.findFirst({ where: { id: message.parentId }, select: { authorId: true } });
      if (parent) targets.set(parent.authorId, "reply");
    }
    for (const mentioned of message.mentionIds) targets.set(mentioned, "mention");
    targets.delete(userId);
    const text = message.body.length > 160 ? `${message.body.slice(0, 157)}…` : message.body;
    for (const [target, kind] of targets) {
      io.to(userRoom(workspaceId, target)).emit("activity:new", { kind, channelId: message.channelId, messageId: message.id, actorName: name, text });
    }
  };

  socket.on("message:send", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const input = schemas.send.parse(payload);
      const message = await sendMessage(db(), userId, input);
      io.to(channelRoom(input.channelId)).emit("message:new", message);
      await notifyActivity(message);
      return message;
    }),
  );

  socket.on("message:edit", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const input = schemas.edit.parse(payload);
      const message = await editMessage(db(), userId, input.id, input.body);
      io.to(channelRoom(message.channelId)).emit("message:updated", message);
      return message;
    }),
  );

  socket.on("message:delete", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const input = schemas.remove.parse(payload);
      const removed = await deleteMessage(db(), actor, input.id);
      io.to(channelRoom(removed.channelId)).emit("message:deleted", removed);
      return { id: removed.id };
    }),
  );

  socket.on("reaction:toggle", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const input = schemas.react.parse(payload);
      const result = await toggleReaction(db(), userId, input.messageId, input.emoji);
      io.to(channelRoom(result.channelId)).emit("reaction:updated", result);
      return result.reactions;
    }),
  );

  socket.on("channel:read", (payload, ack) =>
    respond(ack, async () => {
      const input = schemas.read.parse(payload);
      const at = await markRead(db(), userId, input.channelId);
      io.to(channelRoom(input.channelId)).emit("read:updated", {
        channelId: input.channelId,
        userId,
        lastReadAt: at.toISOString(),
      });
      return { lastReadAt: at.toISOString() };
    }),
  );

  socket.on("channel:create", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const channel = await createChannel(db(), actor, schemas.create.parse(payload));
      subscribeUsers(
        channel,
        channel.members.map((m) => m.userId),
      );
      return channel;
    }),
  );

  socket.on("channel:join", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const channel = await joinChannel(db(), actor, schemas.join.parse(payload).channelId);
      subscribeUsers(channel, [userId]);
      return channel;
    }),
  );

  socket.on("dm:open", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const { channel, created } = await openDm(db(), actor, schemas.dm.parse(payload).userIds);
      const everyone = channel.members.map((m) => m.userId);
      if (created) subscribeUsers(channel, everyone);
      else subscribeUsers(channel, [userId]);
      return channel;
    }),
  );

  socket.on("call:start", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const { channelId } = schemas.call.parse(payload);
      await logCall(db(), userId, channelId); // proves membership, and records the call in the history
      io.to(channelRoom(channelId)).emit("call:started", { channelId, userId, name });
      return { channelId };
    }),
  );

  socket.on("meeting:knock", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const { meetingId } = schemas.knock.parse(payload);
      const result = await knock(db(), actor, meetingId);
      if (result.decision === "waiting") io.to(userRoom(workspaceId, result.hostId)).emit("meeting:knock", { meetingId, userId, name });
      return { decision: result.decision };
    }),
  );

  socket.on("meeting:decide", (payload, ack) =>
    respond(ack, async () => {
      throttled();
      const input = schemas.decide.parse(payload);
      await decideAdmission(db(), actor, input.meetingId, input.userId, input.admit);
      io.to(userRoom(workspaceId, input.userId)).emit("meeting:answered", { meetingId: input.meetingId, admitted: input.admit });
      return { ok: true as const };
    }),
  );

  socket.on("typing", (payload) => {
    const parsed = schemas.typing.safeParse(payload);
    if (!parsed.success) return;
    const room = channelRoom(parsed.data.channelId);
    // Being in the room is the proof of membership (rooms come from the database).
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit("typing", { channelId: parsed.data.channelId, userId, name, on: parsed.data.on });
  });
}
