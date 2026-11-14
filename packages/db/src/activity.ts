/**
 * Call history, the activity feed and message search. Like chat.ts, every
 * function takes a tenant-scoped client and only returns what the acting
 * user may see: conversations they are in and meetings they are invited to.
 */
import { ChatError, getChannelForUser, serializeMessage } from "./chat";
import type { ActivityItem, CallDTO, MessageDTO } from "./chat-types";
import { isAtLeast, type RoleName } from "./roles";
import type { TenantDb } from "./tenant";

const userSelect = { id: true, name: true, imageUrl: true } as const;

// ------------------------------------------------------------------- calls

/** Record that `userId` started a call in a conversation they belong to. */
export async function logCall(db: TenantDb, userId: string, channelId: string): Promise<CallDTO> {
  await getChannelForUser(db, channelId, userId); // proves membership; "not found" otherwise
  const row = await db.call.create({
    data: { workspaceId: db.workspaceId, channelId, startedById: userId },
    include: { startedBy: { select: userSelect } },
  });
  return { id: row.id, channelId: row.channelId, startedAt: row.startedAt.toISOString(), startedBy: row.startedBy };
}

/** Calls in the user's conversations, newest first. */
export async function listRecentCalls(db: TenantDb, userId: string, limit = 30): Promise<CallDTO[]> {
  const rows = await db.call.findMany({
    where: { channel: { members: { some: { userId } } } },
    include: { startedBy: { select: userSelect } },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((row) => ({ id: row.id, channelId: row.channelId, startedAt: row.startedAt.toISOString(), startedBy: row.startedBy }));
}

// ---------------------------------------------------------------- activity

const snippet = (body: string) => (body.length > 160 ? `${body.slice(0, 157)}…` : body);

/** Mentions of the user, replies to their messages and meeting invitations, newest first. */
export async function listActivity(db: TenantDb, userId: string, limit = 50): Promise<ActivityItem[]> {
  const take = Math.min(Math.max(limit, 1), 100);
  const visible = { deletedAt: null, authorId: { not: userId }, channel: { members: { some: { userId } } } };
  const [mentions, replies, invites] = await Promise.all([
    db.message.findMany({
      where: { ...visible, mentionIds: { has: userId } },
      include: { author: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.message.findMany({
      where: { ...visible, parent: { authorId: userId } },
      include: { author: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.meetingInvitee.findMany({
      where: { userId, meeting: { cancelledAt: null } },
      include: { meeting: { include: { host: { select: userSelect } } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const items = new Map<string, ActivityItem>();
  // A reply that also mentions you is listed once, as a mention.
  for (const [kind, rows] of [["reply", replies], ["mention", mentions]] as const) {
    for (const m of rows) {
      items.set(m.id, { kind, id: m.id, at: m.createdAt.toISOString(), actor: m.author, channelId: m.channelId, parentId: m.parentId, text: snippet(m.body) });
    }
  }
  for (const i of invites) {
    items.set(i.id, {
      kind: "invite",
      id: i.id,
      at: i.createdAt.toISOString(),
      actor: i.meeting.host,
      meetingId: i.meetingId,
      title: i.meeting.title,
      startsAt: i.meeting.startsAt.toISOString(),
    });
  }
  return [...items.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}

/** When the user last looked at their activity in this workspace. */
export async function activitySeenAt(db: TenantDb, userId: string): Promise<Date> {
  const row = await db.membership.findFirst({ where: { userId }, select: { activitySeenAt: true } });
  if (!row) throw new ChatError("not_found", "You are not in this workspace.");
  return row.activitySeenAt;
}

export async function countNewActivity(db: TenantDb, userId: string): Promise<number> {
  const since = (await activitySeenAt(db, userId)).toISOString();
  return (await listActivity(db, userId, 100)).filter((item) => item.at > since).length;
}

export async function markActivitySeen(db: TenantDb, userId: string): Promise<Date> {
  const at = new Date();
  await db.membership.updateMany({ where: { userId }, data: { activitySeenAt: at } });
  return at;
}

// ------------------------------------------------------------------ search

/** Messages containing `query` in the user's conversations, newest first. */
export async function searchMessages(db: TenantDb, userId: string, query: string, limit = 30): Promise<MessageDTO[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  if (text.length > 100) throw new ChatError("invalid", "Search for something shorter.");
  const rows = await db.message.findMany({
    where: { deletedAt: null, body: { contains: text, mode: "insensitive" }, channel: { members: { some: { userId } } } },
    include: {
      author: { select: userSelect },
      reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
  return rows.map(serializeMessage);
}

// --------------------------------------------------------------- departure

/**
 * Remove a person from every conversation and meeting of this workspace.
 * Call it whenever their membership ends, so former members stop appearing
 * in member lists and do not silently regain access if they are re-invited.
 * Their past messages stay.
 */
export async function removeMemberData(db: TenantDb, userId: string): Promise<void> {
  await db.channelMember.deleteMany({ where: { userId } });
  await db.meetingInvitee.deleteMany({ where: { userId } });
  await db.meetingAdmission.deleteMany({ where: { userId } });
}

// --------------------------------------------------------------- directory

/** The other people in the workspace. Guests get nobody: they only meet people through conversations they were added to. */
export async function listDirectory(db: TenantDb, actor: { userId: string; role: RoleName }): Promise<{ userId: string; name: string; imageUrl: string | null }[]> {
  if (!isAtLeast(actor.role, "MEMBER")) return [];
  const rows = await db.membership.findMany({
    where: { userId: { not: actor.userId } },
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({ userId: m.userId, name: m.user.name, imageUrl: m.user.imageUrl }));
}
