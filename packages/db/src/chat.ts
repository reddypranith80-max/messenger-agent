/**
 * Chat domain logic. Every function takes a tenant-scoped client, so it can
 * only see one workspace, and checks the acting user's channel membership
 * itself: callers (the realtime service, server actions) cannot forget to.
 */
import {
  MAX_GROUP_SIZE,
  MAX_MESSAGE_LENGTH,
  QUICK_REACTIONS,
  type BrowsableChannelDTO,
  type ChannelDTO,
  type MessageDTO,
  type ReactionDTO,
} from "./chat-types";
import { isAtLeast, type RoleName } from "./roles";
import type { TenantDb } from "./tenant";

export type ChatErrorCode = "not_found" | "forbidden" | "invalid" | "conflict" | "rate_limited";

export class ChatError extends Error {
  constructor(
    public readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

// ------------------------------------------------------------ serialization

const userSelect = { id: true, name: true, imageUrl: true } as const;

const messageInclude = {
  author: { select: userSelect },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" as const } },
  _count: { select: { replies: { where: { deletedAt: null } } } },
};

const channelInclude = { members: { include: { user: { select: userSelect } } } };

type MessageRow = {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  mentionIds: string[];
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: { id: string; name: string; imageUrl: string | null };
  reactions: { emoji: string; userId: string }[];
  _count: { replies: number };
};

export function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
  const byEmoji = new Map<string, string[]>();
  for (const { emoji, userId } of rows) byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), userId]);
  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function serializeMessage(row: MessageRow): MessageDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    channelId: row.channelId,
    parentId: row.parentId,
    authorId: row.authorId,
    author: row.author,
    body: deleted ? "" : row.body,
    mentionIds: deleted ? [] : row.mentionIds,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted,
    replyCount: row._count.replies,
    reactions: deleted ? [] : groupReactions(row.reactions),
  };
}

type ChannelRow = {
  id: string;
  kind: "CHANNEL" | "DM" | "GROUP";
  name: string | null;
  topic: string | null;
  isPrivate: boolean;
  lastMessageAt: Date;
  members: { userId: string; lastReadAt: Date; user: { id: string; name: string; imageUrl: string | null } }[];
};

function serializeChannel(row: ChannelRow, unread: number): ChannelDTO {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    topic: row.topic,
    isPrivate: row.isPrivate,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unread,
    members: row.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      imageUrl: m.user.imageUrl,
      lastReadAt: m.lastReadAt.toISOString(),
    })),
  };
}

function countUnread(db: TenantDb, row: ChannelRow, userId: string): Promise<number> {
  const mine = row.members.find((m) => m.userId === userId);
  if (!mine) return Promise.resolve(0);
  return db.message.count({
    where: { channelId: row.id, createdAt: { gt: mine.lastReadAt }, authorId: { not: userId }, deletedAt: null },
  });
}

// ------------------------------------------------------------------ access

/** The channel, if `userId` is a member. Anything else is "not found" so ids cannot be probed. */
async function memberChannel(db: TenantDb, channelId: string, userId: string) {
  const row = await db.channel.findFirst({
    where: { id: channelId, members: { some: { userId } } },
    include: channelInclude,
  });
  if (!row) throw new ChatError("not_found", "Conversation not found.");
  return row;
}

export async function getChannelForUser(db: TenantDb, channelId: string, userId: string): Promise<ChannelDTO> {
  const row = await memberChannel(db, channelId, userId);
  return serializeChannel(row, await countUnread(db, row, userId));
}

/** A public channel the user has not joined yet (for the join prompt). */
export async function getJoinableChannel(db: TenantDb, channelId: string, role: RoleName) {
  if (!isAtLeast(role, "MEMBER")) return null;
  const row = await db.channel.findFirst({
    where: { id: channelId, kind: "CHANNEL", isPrivate: false },
    select: { id: true, name: true, topic: true },
  });
  return row;
}

export async function listChannelsForUser(db: TenantDb, userId: string): Promise<ChannelDTO[]> {
  const rows = await db.channel.findMany({
    where: { members: { some: { userId } } },
    include: channelInclude,
    orderBy: { lastMessageAt: "desc" },
  });
  const unread = await Promise.all(rows.map((row) => countUnread(db, row, userId)));
  return rows.map((row, i) => serializeChannel(row, unread[i] ?? 0));
}

export async function listBrowsableChannels(db: TenantDb, userId: string, role: RoleName): Promise<BrowsableChannelDTO[]> {
  if (!isAtLeast(role, "MEMBER")) return [];
  const rows = await db.channel.findMany({
    where: { kind: "CHANNEL", isPrivate: false, members: { none: { userId } } },
    select: { id: true, name: true, topic: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name ?? "", topic: r.topic, memberCount: r._count.members }));
}

// -------------------------------------------------------------- channels

export function normalizeChannelName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function assertWorkspaceMembers(db: TenantDb, userIds: string[]) {
  const found = await db.membership.count({ where: { userId: { in: userIds } } });
  if (found !== userIds.length) throw new ChatError("invalid", "Some of those people are not in this workspace.");
}

export async function createChannel(
  db: TenantDb,
  actor: { userId: string; role: RoleName },
  input: { name: string; topic?: string; isPrivate: boolean; memberIds: string[] },
): Promise<ChannelDTO> {
  if (!isAtLeast(actor.role, "MEMBER")) throw new ChatError("forbidden", "Guests cannot create channels.");
  const name = normalizeChannelName(input.name);
  if (!name) throw new ChatError("invalid", "Give the channel a name using letters or numbers.");
  const topic = input.topic?.trim().slice(0, 120) || null;
  const memberIds = [...new Set([actor.userId, ...(input.isPrivate ? input.memberIds : [])])];
  if (memberIds.length > 200) throw new ChatError("invalid", "Too many members.");
  await assertWorkspaceMembers(db, memberIds);

  try {
    const row = await db.channel.create({
      data: {
        workspaceId: db.workspaceId,
        kind: "CHANNEL",
        name,
        topic,
        isPrivate: input.isPrivate,
        createdById: actor.userId,
        members: { create: memberIds.map((userId) => ({ workspaceId: db.workspaceId, userId })) },
      },
      include: channelInclude,
    });
    return serializeChannel(row, 0);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ChatError("conflict", `A channel named #${name} already exists.`);
    throw error;
  }
}

export async function joinChannel(db: TenantDb, actor: { userId: string; role: RoleName }, channelId: string): Promise<ChannelDTO> {
  if (!isAtLeast(actor.role, "MEMBER")) throw new ChatError("forbidden", "Guests cannot join channels on their own.");
  const channel = await db.channel.findFirst({ where: { id: channelId, kind: "CHANNEL", isPrivate: false } });
  if (!channel) throw new ChatError("not_found", "Channel not found.");
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: actor.userId } },
    create: { workspaceId: db.workspaceId, channelId, userId: actor.userId },
    update: {},
  });
  return getChannelForUser(db, channelId, actor.userId);
}

/** Open (or reuse) the conversation between exactly these people. */
export async function openDm(
  db: TenantDb,
  actor: { userId: string; role: RoleName },
  otherIds: string[],
): Promise<{ channel: ChannelDTO; created: boolean }> {
  if (!isAtLeast(actor.role, "MEMBER")) throw new ChatError("forbidden", "Guests cannot start conversations.");
  const ids = [...new Set([actor.userId, ...otherIds])].sort();
  if (ids.length > MAX_GROUP_SIZE) throw new ChatError("invalid", `Group messages are limited to ${MAX_GROUP_SIZE} people.`);
  await assertWorkspaceMembers(db, ids);
  const dmKey = ids.join(":");

  const find = () => db.channel.findFirst({ where: { dmKey }, include: channelInclude });
  const existing = await find();
  if (existing) return { channel: serializeChannel(existing, await countUnread(db, existing, actor.userId)), created: false };

  try {
    const row = await db.channel.create({
      data: {
        workspaceId: db.workspaceId,
        kind: ids.length <= 2 ? "DM" : "GROUP",
        isPrivate: true,
        dmKey,
        createdById: actor.userId,
        members: { create: ids.map((userId) => ({ workspaceId: db.workspaceId, userId })) },
      },
      include: channelInclude,
    });
    return { channel: serializeChannel(row, 0), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await find();
    if (!raced) throw error;
    return { channel: serializeChannel(raced, 0), created: false };
  }
}

/** Make sure #general exists and the user is in it. Guests are left out. */
export async function ensureDefaultChannels(db: TenantDb, actor: { userId: string; role: RoleName }): Promise<void> {
  if (!isAtLeast(actor.role, "MEMBER")) return;
  let general = await db.channel.findFirst({ where: { kind: "CHANNEL", name: "general" }, select: { id: true } });
  if (!general) {
    try {
      general = await db.channel.create({
        data: {
          workspaceId: db.workspaceId,
          kind: "CHANNEL",
          name: "general",
          topic: "Company-wide announcements and conversation",
          createdById: actor.userId,
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      general = await db.channel.findFirst({ where: { kind: "CHANNEL", name: "general" }, select: { id: true } });
    }
  }
  if (!general) return;
  await db.channelMember.upsert({
    where: { channelId_userId: { channelId: general.id, userId: actor.userId } },
    create: { workspaceId: db.workspaceId, channelId: general.id, userId: actor.userId },
    update: {},
  });
}

// -------------------------------------------------------------- messages

function normalizeBody(body: string): string {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new ChatError("invalid", "A message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new ChatError("invalid", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  return text;
}

/** `@Full Name` mentions of people who are in the channel. Longest names first, so "Ann Lee" beats "Ann". */
export function resolveMentions(body: string, members: { userId: string; name: string }[]): string[] {
  let lower = body.toLowerCase();
  const found = new Set<string>();
  for (const m of [...members].sort((a, b) => b.name.length - a.name.length)) {
    const token = `@${m.name.toLowerCase()}`;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      const next = lower[at + token.length];
      if (!next || !/[\p{L}\p{N}_]/u.test(next)) {
        found.add(m.userId);
        // Hide the matched text so a shorter name ("Ann") cannot match inside it ("@Ann Lee").
        lower = lower.slice(0, at) + "\0".repeat(token.length) + lower.slice(at + token.length);
        break;
      }
      from = at + 1;
    }
  }
  return [...found];
}

export async function sendMessage(
  db: TenantDb,
  userId: string,
  input: { channelId: string; body: string; parentId?: string | null },
): Promise<MessageDTO> {
  const channel = await memberChannel(db, input.channelId, userId);
  const body = normalizeBody(input.body);
  if (input.parentId) {
    const parent = await db.message.findFirst({ where: { id: input.parentId, channelId: input.channelId } });
    if (!parent || parent.parentId || parent.deletedAt) throw new ChatError("invalid", "You cannot reply to that message.");
  }
  const mentionIds = resolveMentions(body, channel.members.map((m) => ({ userId: m.userId, name: m.user.name })));
  const row = await db.message.create({
    data: {
      workspaceId: db.workspaceId,
      channelId: input.channelId,
      authorId: userId,
      parentId: input.parentId ?? null,
      body,
      mentionIds,
    },
    include: messageInclude,
  });
  await db.channel.update({ where: { id: input.channelId }, data: { lastMessageAt: row.createdAt } });
  await db.channelMember.updateMany({ where: { channelId: input.channelId, userId }, data: { lastReadAt: row.createdAt } });
  return serializeMessage(row);
}

export async function listMessages(
  db: TenantDb,
  userId: string,
  channelId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  await memberChannel(db, channelId, userId);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const before = opts.before ? new Date(opts.before) : null;
  if (before && Number.isNaN(before.getTime())) throw new ChatError("invalid", "Bad cursor.");
  const rows = await db.message.findMany({
    where: { channelId, parentId: null, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(serializeMessage), hasMore };
}

export async function listThread(
  db: TenantDb,
  userId: string,
  channelId: string,
  parentId: string,
): Promise<{ root: MessageDTO; replies: MessageDTO[] }> {
  await memberChannel(db, channelId, userId);
  const root = await db.message.findFirst({ where: { id: parentId, channelId, parentId: null }, include: messageInclude });
  if (!root) throw new ChatError("not_found", "Message not found.");
  const replies = await db.message.findMany({
    where: { channelId, parentId },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: messageInclude,
  });
  return { root: serializeMessage(root), replies: replies.map(serializeMessage) };
}

/** A message the user can see: it exists in this workspace and they are in its channel. */
async function visibleMessage(db: TenantDb, userId: string, id: string) {
  const row = await db.message.findFirst({ where: { id, channel: { members: { some: { userId } } } } });
  if (!row) throw new ChatError("not_found", "Message not found.");
  return row;
}

export async function editMessage(db: TenantDb, userId: string, id: string, body: string): Promise<MessageDTO> {
  const message = await visibleMessage(db, userId, id);
  if (message.authorId !== userId) throw new ChatError("forbidden", "You can only edit your own messages.");
  if (message.deletedAt) throw new ChatError("invalid", "That message was deleted.");
  const text = normalizeBody(body);
  const channel = await memberChannel(db, message.channelId, userId);
  const row = await db.message.update({
    where: { id },
    data: {
      body: text,
      editedAt: new Date(),
      mentionIds: resolveMentions(text, channel.members.map((m) => ({ userId: m.userId, name: m.user.name }))),
    },
    include: messageInclude,
  });
  return serializeMessage(row);
}

export async function deleteMessage(
  db: TenantDb,
  actor: { userId: string; role: RoleName },
  id: string,
): Promise<{ id: string; channelId: string; parentId: string | null }> {
  const message = await visibleMessage(db, actor.userId, id);
  if (message.authorId !== actor.userId && !isAtLeast(actor.role, "ADMIN")) {
    throw new ChatError("forbidden", "You can only delete your own messages.");
  }
  if (!message.deletedAt) {
    await db.message.update({ where: { id }, data: { deletedAt: new Date(), body: "", mentionIds: [] } });
    await db.reaction.deleteMany({ where: { messageId: id } });
  }
  return { id, channelId: message.channelId, parentId: message.parentId };
}

export async function toggleReaction(
  db: TenantDb,
  userId: string,
  messageId: string,
  emoji: string,
): Promise<{ channelId: string; messageId: string; reactions: ReactionDTO[] }> {
  if (!(QUICK_REACTIONS as readonly string[]).includes(emoji)) throw new ChatError("invalid", "That reaction is not available.");
  const message = await visibleMessage(db, userId, messageId);
  if (message.deletedAt) throw new ChatError("invalid", "That message was deleted.");
  const existing = await db.reaction.findFirst({ where: { messageId, userId, emoji } });
  if (existing) {
    await db.reaction.deleteMany({ where: { messageId, userId, emoji } });
  } else {
    try {
      await db.reaction.create({ data: { workspaceId: db.workspaceId, messageId, userId, emoji } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // double tap
    }
  }
  const rows = await db.reaction.findMany({ where: { messageId }, select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } });
  return { channelId: message.channelId, messageId, reactions: groupReactions(rows) };
}

export async function markRead(db: TenantDb, userId: string, channelId: string): Promise<Date> {
  const at = new Date();
  const { count } = await db.channelMember.updateMany({ where: { channelId, userId }, data: { lastReadAt: at } });
  if (count === 0) throw new ChatError("not_found", "Conversation not found.");
  return at;
}
