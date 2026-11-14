/** Meetings against a real database. Skipped when DATABASE_URL is not set. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChatError } from "./chat";
import { getPrisma } from "./client";
import { JOIN_EARLY_MS, joinWindow } from "./meeting-types";
import { cancelMeeting, createMeeting, decideAdmission, getMeeting, joinDecision, knock, listMeetings, listWaiting } from "./meetings";
import { tenantDb } from "./tenant";

const hasDb = Boolean(process.env.DATABASE_URL);
const run = `m${Date.now().toString(36)}`;
const HOUR = 3_600_000;

describe("joinWindow()", () => {
  const meeting = { startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 2 * HOUR).toISOString() };
  it("opens 15 minutes early and closes an hour after the end", () => {
    const start = new Date(meeting.startsAt).getTime();
    const end = new Date(meeting.endsAt).getTime();
    expect(joinWindow(meeting, start - JOIN_EARLY_MS - 1000)).toBe("early");
    expect(joinWindow(meeting, start - JOIN_EARLY_MS + 1000)).toBe("open");
    expect(joinWindow(meeting, end)).toBe("open");
    expect(joinWindow(meeting, end + HOUR + 1000)).toBe("ended");
  });
});

describe.skipIf(!hasDb)("meetings against Postgres", () => {
  const ids = { wsA: "", wsB: "", host: "", guestInvitee: "", member: "", guest: "", eve: "" };
  const A = () => tenantDb(ids.wsA);
  const B = () => tenantDb(ids.wsB);
  const host = () => ({ userId: ids.host, role: "ADMIN" as const });
  const member = () => ({ userId: ids.member, role: "MEMBER" as const });
  const guest = () => ({ userId: ids.guest, role: "GUEST" as const });
  const invited = () => ({ userId: ids.guestInvitee, role: "GUEST" as const });
  const start = () => new Date(Date.now() + HOUR).toISOString();
  const end = () => new Date(Date.now() + 2 * HOUR).toISOString();

  const rejects = async (promise: Promise<unknown>, code: string) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ChatError);
    expect((error as ChatError).code).toBe(code);
  };

  beforeAll(async () => {
    const db = getPrisma();
    const [a, b] = await Promise.all(["a", "b"].map((k) => db.workspace.create({ data: { clerkOrgId: `org_${run}_${k}`, name: `Meet ${k}`, slug: `${run}-${k}` } })));
    ids.wsA = a!.id;
    ids.wsB = b!.id;
    const roles = { host: "ADMIN", guestInvitee: "GUEST", member: "MEMBER", guest: "GUEST" } as const;
    for (const n of ["host", "guestInvitee", "member", "guest", "eve"] as const) {
      const u = await db.user.create({ data: { clerkId: `user_${run}_${n}`, email: `${n}.${run}@example.test`, name: `${n} ${run}` } });
      ids[n] = u.id;
      await db.membership.create({ data: { workspaceId: n === "eve" ? ids.wsB : ids.wsA, userId: u.id, role: n === "eve" ? "OWNER" : roles[n] } });
    }
  });

  afterAll(async () => {
    const db = getPrisma();
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA, ids.wsB] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.host, ids.guestInvitee, ids.member, ids.guest, ids.eve] } } });
    await db.$disconnect();
  });

  let meetingId = "";

  it("validates what can be scheduled", async () => {
    const ok = { title: "Sync", startsAt: start(), endsAt: end(), inviteeIds: [], lobbyEnabled: true };
    await rejects(createMeeting(A(), guest(), ok), "forbidden");
    await rejects(createMeeting(A(), host(), { ...ok, title: "   " }), "invalid");
    await rejects(createMeeting(A(), host(), { ...ok, endsAt: ok.startsAt }), "invalid");
    await rejects(createMeeting(A(), host(), { ...ok, startsAt: "not a date" }), "invalid");
    await rejects(createMeeting(A(), host(), { ...ok, endsAt: new Date(Date.now() + 20 * HOUR).toISOString() }), "invalid");
    await rejects(createMeeting(A(), host(), { ...ok, startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - 2 * HOUR).toISOString() }), "invalid");
    await rejects(createMeeting(A(), host(), { ...ok, inviteeIds: [ids.eve] }), "invalid"); // not in this workspace
  });

  it("creates a meeting with an unguessable code and the invitees", async () => {
    const m = await createMeeting(A(), host(), { title: " Planning ", description: "Q1", startsAt: start(), endsAt: end(), inviteeIds: [ids.guestInvitee, ids.guestInvitee, ids.host], lobbyEnabled: true });
    meetingId = m.id;
    expect(m.title).toBe("Planning");
    expect(m.code.length).toBeGreaterThanOrEqual(12);
    expect(m.invitees.map((i) => i.userId)).toEqual([ids.guestInvitee]); // de-duplicated, host not listed
    const other = await createMeeting(A(), host(), { title: "Other", startsAt: start(), endsAt: end(), inviteeIds: [], lobbyEnabled: false });
    expect(other.code).not.toBe(m.code);
  });

  it("only the host and invitees can see a meeting", async () => {
    expect((await getMeeting(A(), ids.host, meetingId)).title).toBe("Planning");
    expect((await getMeeting(A(), ids.guestInvitee, meetingId)).title).toBe("Planning");
    await rejects(getMeeting(A(), ids.member, meetingId), "not_found");
    await rejects(getMeeting(B(), ids.eve, meetingId), "not_found");
    const range = { from: new Date(), to: new Date(Date.now() + 24 * HOUR) };
    expect((await listMeetings(A(), ids.host, range)).length).toBe(2);
    expect((await listMeetings(A(), ids.guestInvitee, range)).map((m) => m.title)).toEqual(["Planning"]);
    expect(await listMeetings(A(), ids.member, range)).toEqual([]);
    expect(await listMeetings(B(), ids.eve, range)).toEqual([]);
  });

  it("decides how each person gets in", async () => {
    expect((await joinDecision(A(), host(), meetingId)).decision).toBe("host");
    expect((await joinDecision(A(), invited(), meetingId)).decision).toBe("invited");
    expect((await joinDecision(A(), member(), meetingId)).decision).toBe("knock"); // lobby on
    expect((await joinDecision(A(), guest(), meetingId)).decision).toBe("forbidden"); // guests need an invitation
    expect((await joinDecision(B(), { userId: ids.eve, role: "OWNER" }, meetingId)).decision).toBe("forbidden"); // other workspace
  });

  it("lobby: knock, wait, admit or deny", async () => {
    expect((await knock(A(), member(), meetingId)).decision).toBe("waiting");
    expect((await knock(A(), member(), meetingId)).decision).toBe("waiting"); // idempotent
    expect((await listWaiting(A(), host(), meetingId)).map((p) => p.userId)).toEqual([ids.member]);
    expect(await listWaiting(A(), member(), meetingId)).toEqual([]); // only the host sees the lobby
    await rejects(decideAdmission(A(), member(), meetingId, ids.member, true), "forbidden"); // cannot admit yourself
    await rejects(decideAdmission(A(), host(), meetingId, ids.guest, true), "not_found"); // nobody knocked
    await decideAdmission(A(), host(), meetingId, ids.member, true);
    expect((await joinDecision(A(), member(), meetingId)).decision).toBe("admitted");
    expect(await listWaiting(A(), host(), meetingId)).toEqual([]);
    await decideAdmission(A(), host(), meetingId, ids.member, false);
    expect((await joinDecision(A(), member(), meetingId)).decision).toBe("denied");
    expect((await knock(A(), member(), meetingId)).decision).toBe("denied"); // knocking again does not undo a denial
  });

  it("with the lobby off, any member walks in but guests still need an invitation", async () => {
    const open = await createMeeting(A(), host(), { title: "Open house", startsAt: start(), endsAt: end(), inviteeIds: [], lobbyEnabled: false });
    expect((await joinDecision(A(), member(), open.id)).decision).toBe("open");
    expect((await joinDecision(A(), guest(), open.id)).decision).toBe("forbidden");
  });

  it("cancelling is limited to the host or an admin, and blocks joining", async () => {
    await rejects(cancelMeeting(A(), member(), meetingId), "forbidden");
    await rejects(cancelMeeting(B(), { userId: ids.eve, role: "OWNER" }, meetingId), "not_found");
    const result = await cancelMeeting(A(), host(), meetingId);
    expect(result.recipients.sort()).toEqual([ids.host, ids.guestInvitee].sort());
    expect((await joinDecision(A(), invited(), meetingId)).decision).toBe("forbidden");
    expect((await listMeetings(A(), ids.host, { from: new Date(), to: new Date(Date.now() + 24 * HOUR) })).map((m) => m.title)).not.toContain("Planning");
  });
});
