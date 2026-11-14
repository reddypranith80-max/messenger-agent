/**
 * Meeting domain logic. Like chat.ts: every function takes a tenant-scoped
 * client and checks who is asking.
 */
import { randomBytes } from "node:crypto";
import { ChatError } from "./chat";
import type { JoinDecision, MeetingDTO, MeetingPerson } from "./meeting-types";
import { isAtLeast, type RoleName } from "./roles";
import type { TenantDb } from "./tenant";

const userSelect = { id: true, name: true, imageUrl: true } as const;
const meetingInclude = {
  host: { select: userSelect },
  invitees: { include: { user: { select: userSelect } }, orderBy: { createdAt: "asc" as const } },
};

type MeetingRow = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  code: string;
  lobbyEnabled: boolean;
  cancelledAt: Date | null;
  host: { id: string; name: string; imageUrl: string | null };
  invitees: { userId: string; user: { id: string; name: string; imageUrl: string | null } }[];
};

const person = (u: { id: string; name: string; imageUrl: string | null }): MeetingPerson => ({ userId: u.id, name: u.name, imageUrl: u.imageUrl });

export function serializeMeeting(row: MeetingRow): MeetingDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    code: row.code,
    lobbyEnabled: row.lobbyEnabled,
    cancelled: row.cancelledAt !== null,
    host: person(row.host),
    invitees: row.invitees.map((i) => person(i.user)),
  };
}

export type MeetingInput = {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  inviteeIds: string[];
  lobbyEnabled: boolean;
};

const MAX_DURATION_MS = 12 * 60 * 60_000;

export async function createMeeting(db: TenantDb, actor: { userId: string; role: RoleName }, input: MeetingInput): Promise<MeetingDTO> {
  if (!isAtLeast(actor.role, "MEMBER")) throw new ChatError("forbidden", "Guests cannot schedule meetings.");
  const title = input.title.trim();
  if (!title || title.length > 120) throw new ChatError("invalid", "Give the meeting a title of up to 120 characters.");
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new ChatError("invalid", "Pick a valid start and end time.");
  if (endsAt <= startsAt) throw new ChatError("invalid", "The meeting must end after it starts.");
  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) throw new ChatError("invalid", "Meetings can last at most 12 hours.");
  if (endsAt.getTime() < Date.now()) throw new ChatError("invalid", "That time is in the past.");
  if (startsAt.getTime() > Date.now() + 366 * 24 * 60 * 60_000) throw new ChatError("invalid", "Schedule meetings within the next year.");

  const inviteeIds = [...new Set(input.inviteeIds)].filter((id) => id !== actor.userId);
  if (inviteeIds.length > 200) throw new ChatError("invalid", "Too many invitees.");
  if ((await db.membership.count({ where: { userId: { in: inviteeIds } } })) !== inviteeIds.length) {
    throw new ChatError("invalid", "Some of those people are not in this workspace.");
  }

  const row = await db.meeting.create({
    data: {
      workspaceId: db.workspaceId,
      hostId: actor.userId,
      title,
      description: input.description?.trim().slice(0, 2000) || null,
      startsAt,
      endsAt,
      code: randomBytes(9).toString("base64url"),
      lobbyEnabled: input.lobbyEnabled,
      invitees: { create: inviteeIds.map((userId) => ({ workspaceId: db.workspaceId, userId })) },
    },
    include: meetingInclude,
  });
  return serializeMeeting(row);
}

/** Meetings the user hosts or is invited to. */
export async function listMeetings(
  db: TenantDb,
  userId: string,
  range: { from: Date; to: Date },
): Promise<MeetingDTO[]> {
  const rows = await db.meeting.findMany({
    where: {
      cancelledAt: null,
      endsAt: { gte: range.from },
      startsAt: { lte: range.to },
      OR: [{ hostId: userId }, { invitees: { some: { userId } } }],
    },
    include: meetingInclude,
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  return rows.map(serializeMeeting);
}

/** A meeting the user hosts or is invited to. Anyone else gets "not found". */
export async function getMeeting(db: TenantDb, userId: string, id: string): Promise<MeetingDTO> {
  const row = await db.meeting.findFirst({
    where: { id, OR: [{ hostId: userId }, { invitees: { some: { userId } } }] },
    include: meetingInclude,
  });
  if (!row) throw new ChatError("not_found", "Meeting not found.");
  return serializeMeeting(row);
}

export async function cancelMeeting(db: TenantDb, actor: { userId: string; role: RoleName }, id: string): Promise<{ id: string; recipients: string[] }> {
  const row = await db.meeting.findFirst({ where: { id }, include: { invitees: true } });
  if (!row) throw new ChatError("not_found", "Meeting not found.");
  if (row.hostId !== actor.userId && !isAtLeast(actor.role, "ADMIN")) throw new ChatError("forbidden", "Only the host can cancel this meeting.");
  await db.meeting.update({ where: { id }, data: { cancelledAt: row.cancelledAt ?? new Date() } });
  return { id, recipients: [row.hostId, ...row.invitees.map((i) => i.userId)] };
}

/** Everything needed to decide whether someone may enter, and nothing about the room itself. */
export async function joinDecision(db: TenantDb, actor: { userId: string; role: RoleName }, meetingId: string) {
  const meeting = await db.meeting.findFirst({ where: { id: meetingId }, include: { invitees: { select: { userId: true } } } });
  if (!meeting || meeting.cancelledAt) return { meeting: null, decision: "forbidden" as JoinDecision };
  let decision: JoinDecision;
  if (meeting.hostId === actor.userId) decision = "host";
  else if (meeting.invitees.some((i) => i.userId === actor.userId)) decision = "invited";
  else if (!isAtLeast(actor.role, "MEMBER")) decision = "forbidden"; // guests only get in by invitation
  else if (!meeting.lobbyEnabled) decision = "open";
  else {
    const admission = await db.meetingAdmission.findFirst({ where: { meetingId, userId: actor.userId } });
    decision = !admission ? "knock" : admission.status === "ADMITTED" ? "admitted" : admission.status === "DENIED" ? "denied" : "waiting";
  }
  return { meeting, decision };
}

/** Ask the host to let you in. Returns the new decision. */
export async function knock(db: TenantDb, actor: { userId: string; role: RoleName }, meetingId: string) {
  const { meeting, decision } = await joinDecision(db, actor, meetingId);
  if (!meeting) throw new ChatError("not_found", "Meeting not found.");
  if (decision !== "knock") return { decision, hostId: meeting.hostId, meetingTitle: meeting.title };
  await db.meetingAdmission.upsert({
    where: { meetingId_userId: { meetingId, userId: actor.userId } },
    create: { workspaceId: db.workspaceId, meetingId, userId: actor.userId, status: "WAITING" },
    update: {},
  });
  return { decision: "waiting" as JoinDecision, hostId: meeting.hostId, meetingTitle: meeting.title };
}

export async function decideAdmission(
  db: TenantDb,
  actor: { userId: string; role: RoleName },
  meetingId: string,
  userId: string,
  admit: boolean,
): Promise<{ meetingTitle: string }> {
  const meeting = await db.meeting.findFirst({ where: { id: meetingId, cancelledAt: null } });
  if (!meeting) throw new ChatError("not_found", "Meeting not found.");
  if (meeting.hostId !== actor.userId && !isAtLeast(actor.role, "ADMIN")) throw new ChatError("forbidden", "Only the host can let people in.");
  const { count } = await db.meetingAdmission.updateMany({ where: { meetingId, userId }, data: { status: admit ? "ADMITTED" : "DENIED" } });
  if (count === 0) throw new ChatError("not_found", "That person is not waiting.");
  return { meetingTitle: meeting.title };
}

export async function listWaiting(db: TenantDb, actor: { userId: string; role: RoleName }, meetingId: string): Promise<MeetingPerson[]> {
  const meeting = await db.meeting.findFirst({ where: { id: meetingId } });
  if (!meeting) throw new ChatError("not_found", "Meeting not found.");
  if (meeting.hostId !== actor.userId && !isAtLeast(actor.role, "ADMIN")) return [];
  const rows = await db.meetingAdmission.findMany({
    where: { meetingId, status: "WAITING" },
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => person(r.user));
}
