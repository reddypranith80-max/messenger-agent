/** Call history, activity feed and search against a real database. Skipped when DATABASE_URL is not set. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activitySeenAt, countNewActivity, listActivity, listRecentCalls, logCall, markActivitySeen, searchMessages } from "./activity";
import { ChatError, createChannel, openDm, sendMessage } from "./chat";
import { getPrisma } from "./client";
import { createMeeting } from "./meetings";
import { tenantDb } from "./tenant";

const hasDb = Boolean(process.env.DATABASE_URL);
const run = `v${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("calls, activity and search against Postgres", () => {
  const prisma = () => getPrisma();
  const ids = { wsA: "", wsB: "", ann: "", bob: "", cat: "", eve: "" };
  const A = () => tenantDb(ids.wsA);
  const B = () => tenantDb(ids.wsB);
  const ann = () => ({ userId: ids.ann, role: "OWNER" as const });
  let team = "";
  let secret = "";
  let dm = "";

  const rejects = async (promise: Promise<unknown>, code: string) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ChatError);
    expect((error as ChatError).code).toBe(code);
  };

  beforeAll(async () => {
    const db = prisma();
    const [a, b] = await Promise.all(
      ["a", "b"].map((k) => db.workspace.create({ data: { clerkOrgId: `org_${run}_${k}`, name: `Act ${k}`, slug: `${run}-${k}` } })),
    );
    ids.wsA = a!.id;
    ids.wsB = b!.id;
    for (const n of ["ann", "bob", "cat", "eve"] as const) {
      const u = await db.user.create({ data: { clerkId: `user_${run}_${n}`, email: `${n}.${run}@example.test`, name: `${n[0]!.toUpperCase()}${n.slice(1)} ${run}` } });
      ids[n] = u.id;
    }
    // Memberships start "seen" a minute ago so everything created below counts as new.
    const seen = new Date(Date.now() - 60_000);
    for (const n of ["ann", "bob", "cat"] as const) {
      await db.membership.create({ data: { workspaceId: ids.wsA, userId: ids[n], role: n === "ann" ? "OWNER" : "MEMBER", activitySeenAt: seen } });
    }
    await db.membership.create({ data: { workspaceId: ids.wsB, userId: ids.eve, role: "OWNER", activitySeenAt: seen } });

    // team: ann + bob + cat. secret: ann + bob only. dm: ann + bob.
    team = (await createChannel(A(), ann(), { name: `team-${run}`, isPrivate: true, memberIds: [ids.bob, ids.cat] })).id;
    secret = (await createChannel(A(), ann(), { name: `secret-${run}`, isPrivate: true, memberIds: [ids.bob] })).id;
    dm = (await openDm(A(), ann(), [ids.bob])).channel.id;
  });

  afterAll(async () => {
    const db = prisma();
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA, ids.wsB] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.ann, ids.bob, ids.cat, ids.eve] } } });
    await db.$disconnect();
  });

  it("logs calls only for members of the conversation", async () => {
    const call = await logCall(A(), ids.ann, secret);
    expect(call.channelId).toBe(secret);
    expect(call.startedBy.id).toBe(ids.ann);
    await logCall(A(), ids.bob, team);
    await rejects(logCall(A(), ids.cat, secret), "not_found"); // not in the channel
    await rejects(logCall(B(), ids.eve, secret), "not_found"); // another workspace
  });

  it("call history only shows calls from your own conversations", async () => {
    expect((await listRecentCalls(A(), ids.ann)).map((c) => c.channelId)).toEqual([team, secret]); // newest first
    expect((await listRecentCalls(A(), ids.cat)).map((c) => c.channelId)).toEqual([team]);
    expect(await listRecentCalls(B(), ids.eve)).toEqual([]);
    expect(await listRecentCalls(A(), ids.eve)).toEqual([]); // not a member of anything here
  });

  it("activity lists mentions, replies to your messages and invitations", async () => {
    const root = await sendMessage(A(), ids.bob, { channelId: team, body: `kickoff ${run}` });
    await sendMessage(A(), ids.ann, { channelId: team, body: `@Bob ${run} please look`, parentId: null });
    await sendMessage(A(), ids.cat, { channelId: team, body: `replying ${run}`, parentId: root.id });
    await sendMessage(A(), ids.ann, { channelId: team, body: `thread reply and @Bob ${run} mention`, parentId: root.id });
    await sendMessage(A(), ids.bob, { channelId: team, body: `my own reply ${run}`, parentId: root.id });
    await createMeeting(A(), ann(), {
      title: `Planning ${run}`,
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 5400_000).toISOString(),
      inviteeIds: [ids.bob],
      lobbyEnabled: true,
    });

    const feed = await listActivity(A(), ids.bob);
    expect(feed.map((i) => i.kind).sort()).toEqual(["invite", "mention", "mention", "reply"]);
    expect(feed.every((i) => i.actor.id !== ids.bob)).toBe(true); // nothing you did yourself
    const invite = feed.find((i) => i.kind === "invite");
    expect(invite && invite.kind === "invite" && invite.title).toBe(`Planning ${run}`);
    // Newest first.
    expect([...feed].sort((a, b) => b.at.localeCompare(a.at))).toEqual(feed);
    // Cat was neither mentioned nor replied to nor invited.
    expect(await listActivity(A(), ids.cat)).toEqual([]);
  });

  it("activity never includes conversations you are not in", async () => {
    // Ann mentions Cat by name in a channel Cat cannot see: no mention is recorded, nothing leaks.
    await sendMessage(A(), ids.ann, { channelId: secret, body: `@Cat ${run} should not see this` });
    expect(await listActivity(A(), ids.cat)).toEqual([]);
    expect(await listActivity(B(), ids.eve)).toEqual([]);
    expect(await listActivity(B(), ids.bob)).toEqual([]); // bob's activity is not visible through another tenant
  });

  it("tracks what is new and clears it when seen", async () => {
    expect(await countNewActivity(A(), ids.bob)).toBe(4);
    const at = await markActivitySeen(A(), ids.bob);
    expect((await activitySeenAt(A(), ids.bob)).getTime()).toBe(at.getTime());
    expect(await countNewActivity(A(), ids.bob)).toBe(0);
    await rejects(activitySeenAt(A(), ids.eve), "not_found");
    // Marking seen through another workspace's client changes nothing here.
    const before = await activitySeenAt(A(), ids.ann);
    await markActivitySeen(B(), ids.ann);
    expect((await activitySeenAt(A(), ids.ann)).getTime()).toBe(before.getTime());
  });

  it("search only finds messages in your own conversations", async () => {
    await sendMessage(A(), ids.ann, { channelId: dm, body: `Quarterly BUDGET ${run} numbers` });
    await sendMessage(A(), ids.ann, { channelId: team, body: `budget ${run} review on friday` });

    const annHits = await searchMessages(A(), ids.ann, `budget ${run}`);
    expect(annHits.map((m) => m.channelId).sort()).toEqual([dm, team].sort()); // case-insensitive
    const catHits = await searchMessages(A(), ids.cat, `budget ${run}`);
    expect(catHits.map((m) => m.channelId)).toEqual([team]); // the DM is private to ann and bob
    expect(await searchMessages(B(), ids.eve, `budget ${run}`)).toEqual([]);
    expect(await searchMessages(A(), ids.eve, `budget ${run}`)).toEqual([]);
  });

  it("search ignores deleted messages and too-short queries", async () => {
    const gone = await sendMessage(A(), ids.ann, { channelId: team, body: `ephemeral ${run}` });
    await A().message.update({ where: { id: gone.id }, data: { deletedAt: new Date(), body: "" } });
    expect(await searchMessages(A(), ids.ann, `ephemeral ${run}`)).toEqual([]);
    expect(await searchMessages(A(), ids.ann, "b")).toEqual([]);
    await rejects(searchMessages(A(), ids.ann, "x".repeat(101)), "invalid");
  });
});
