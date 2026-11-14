/** Chat behaviour against a real database. Skipped when DATABASE_URL is not set. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ChatError,
  createChannel,
  deleteMessage,
  editMessage,
  ensureDefaultChannels,
  getChannelForUser,
  joinChannel,
  listBrowsableChannels,
  listChannelsForUser,
  listMessages,
  listThread,
  markRead,
  openDm,
  resolveMentions,
  sendMessage,
  toggleReaction,
} from "./chat";
import { getPrisma } from "./client";
import { tenantDb } from "./tenant";

const hasDb = Boolean(process.env.DATABASE_URL);
const run = `c${Date.now().toString(36)}`;

describe("resolveMentions()", () => {
  const members = [
    { userId: "1", name: "Ann" },
    { userId: "2", name: "Ann Lee" },
    { userId: "3", name: "Bo" },
  ];
  it("prefers the longest matching name and ignores partial words", () => {
    expect(resolveMentions("hi @Ann Lee, and @bo!", members).sort()).toEqual(["2", "3"]);
    expect(resolveMentions("hello @Annabel", members)).toEqual([]);
    expect(resolveMentions("no mentions here", members)).toEqual([]);
    expect(resolveMentions("email me@Ann", members)).toEqual(["1"]);
  });
});

describe.skipIf(!hasDb)("chat against Postgres", () => {
  const prisma = () => getPrisma();
  const ids = { wsA: "", wsB: "", ann: "", bob: "", cat: "", guest: "", eve: "" };
  const A = () => tenantDb(ids.wsA);
  const B = () => tenantDb(ids.wsB);
  const ann = () => ({ userId: ids.ann, role: "OWNER" as const });
  const bob = () => ({ userId: ids.bob, role: "MEMBER" as const });
  const guest = () => ({ userId: ids.guest, role: "GUEST" as const });

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
      ["a", "b"].map((k) => db.workspace.create({ data: { clerkOrgId: `org_${run}_${k}`, name: `Chat ${k}`, slug: `${run}-${k}` } })),
    );
    ids.wsA = a!.id;
    ids.wsB = b!.id;
    const names = ["ann", "bob", "cat", "guest", "eve"] as const;
    for (const n of names) {
      const u = await db.user.create({ data: { clerkId: `user_${run}_${n}`, email: `${n}.${run}@example.test`, name: `${n[0]!.toUpperCase()}${n.slice(1)} ${run}` } });
      ids[n] = u.id;
    }
    const role = { ann: "OWNER", bob: "MEMBER", cat: "MEMBER", guest: "GUEST" } as const;
    for (const n of ["ann", "bob", "cat", "guest"] as const) {
      await db.membership.create({ data: { workspaceId: ids.wsA, userId: ids[n], role: role[n] } });
    }
    await db.membership.create({ data: { workspaceId: ids.wsB, userId: ids.eve, role: "OWNER" } });
  });

  afterAll(async () => {
    const db = prisma();
    await db.workspace.deleteMany({ where: { id: { in: [ids.wsA, ids.wsB] } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids).filter((id) => id && id !== ids.wsA && id !== ids.wsB) } } });
    await db.$disconnect();
  });

  let general = "";
  let secret = "";
  let dm = "";

  it("creates #general once and puts members (not guests) in it", async () => {
    await ensureDefaultChannels(A(), ann());
    await ensureDefaultChannels(A(), bob());
    await ensureDefaultChannels(A(), ann()); // idempotent
    await ensureDefaultChannels(A(), guest());
    const annChannels = await listChannelsForUser(A(), ids.ann);
    expect(annChannels.map((c) => c.name)).toEqual(["general"]);
    expect(annChannels[0]!.members.map((m) => m.userId).sort()).toEqual([ids.ann, ids.bob].sort());
    expect(await listChannelsForUser(A(), ids.guest)).toEqual([]);
    general = annChannels[0]!.id;
  });

  it("validates channel names and rejects duplicates", async () => {
    await rejects(createChannel(A(), ann(), { name: "  !!! ", isPrivate: false, memberIds: [] }), "invalid");
    await rejects(createChannel(A(), ann(), { name: "#General", isPrivate: false, memberIds: [] }), "conflict");
    await rejects(createChannel(A(), guest(), { name: "mine", isPrivate: false, memberIds: [] }), "forbidden");
    await rejects(createChannel(A(), ann(), { name: "x", isPrivate: true, memberIds: [ids.eve] }), "invalid"); // not in workspace
  });

  it("private channels are invisible to non-members, even by id", async () => {
    const created = await createChannel(A(), ann(), { name: "Secret Plans", isPrivate: true, memberIds: [ids.bob] });
    expect(created.name).toBe("secret-plans");
    secret = created.id;
    expect((await listChannelsForUser(A(), ids.bob)).map((c) => c.name)).toContain("secret-plans");
    expect((await listBrowsableChannels(A(), ids.cat, "MEMBER")).map((c) => c.name)).not.toContain("secret-plans");
    await rejects(getChannelForUser(A(), secret, ids.cat), "not_found");
    await rejects(sendMessage(A(), ids.cat, { channelId: secret, body: "let me in" }), "not_found");
    await rejects(listMessages(A(), ids.cat, secret), "not_found");
    await rejects(joinChannel(A(), { userId: ids.cat, role: "MEMBER" }, secret), "not_found");
  });

  it("public channels can be browsed and joined by members but not guests", async () => {
    const pub = await createChannel(A(), ann(), { name: "random", isPrivate: false, memberIds: [ids.cat] });
    expect(pub.members.map((m) => m.userId)).toEqual([ids.ann]); // public: others join themselves
    expect((await listBrowsableChannels(A(), ids.bob, "MEMBER")).map((c) => c.name)).toContain("random");
    expect(await listBrowsableChannels(A(), ids.guest, "GUEST")).toEqual([]);
    await rejects(joinChannel(A(), guest(), pub.id), "forbidden");
    const joined = await joinChannel(A(), bob(), pub.id);
    expect(joined.members.map((m) => m.userId).sort()).toEqual([ids.ann, ids.bob].sort());
    await joinChannel(A(), bob(), pub.id); // idempotent
  });

  it("sends, lists and paginates messages", async () => {
    const first = await sendMessage(A(), ids.ann, { channelId: general, body: `  hello @Bob ${run}  ` });
    expect(first.body).toBe(`hello @Bob ${run}`);
    expect(first.mentionIds).toEqual([ids.bob]);
    expect(first.author.id).toBe(ids.ann);
    for (let i = 0; i < 4; i++) await sendMessage(A(), ids.bob, { channelId: general, body: `msg ${i}` });
    const page1 = await listMessages(A(), ids.ann, general, { limit: 3 });
    expect(page1.hasMore).toBe(true);
    expect(page1.messages.map((m) => m.body)).toEqual(["msg 1", "msg 2", "msg 3"]);
    const page2 = await listMessages(A(), ids.ann, general, { limit: 3, before: page1.messages[0]!.createdAt });
    expect(page2.hasMore).toBe(false);
    expect(page2.messages.map((m) => m.body)).toEqual([first.body, "msg 0"]);
    await rejects(sendMessage(A(), ids.ann, { channelId: general, body: "   " }), "invalid");
    await rejects(sendMessage(A(), ids.ann, { channelId: general, body: "x".repeat(4001) }), "invalid");
  });

  it("counts unread for other people and clears it on read", async () => {
    const before = (await getChannelForUser(A(), general, ids.ann)).unread;
    expect(before).toBe(4); // bob's four messages
    await markRead(A(), ids.ann, general);
    expect((await getChannelForUser(A(), general, ids.ann)).unread).toBe(0);
    expect((await getChannelForUser(A(), general, ids.bob)).unread).toBe(0); // bob wrote last... ann's first predates his sends
    await sendMessage(A(), ids.ann, { channelId: general, body: "ping" });
    expect((await getChannelForUser(A(), general, ids.bob)).unread).toBe(1);
    expect((await getChannelForUser(A(), general, ids.ann)).unread).toBe(0); // own messages never count
  });

  it("threads: replies hang off a root and are counted", async () => {
    const root = (await listMessages(A(), ids.ann, general, { limit: 1 })).messages[0]!;
    const reply = await sendMessage(A(), ids.bob, { channelId: general, body: "in thread", parentId: root.id });
    expect(reply.parentId).toBe(root.id);
    await rejects(sendMessage(A(), ids.bob, { channelId: general, body: "nested", parentId: reply.id }), "invalid");
    await rejects(sendMessage(A(), ids.bob, { channelId: secret, body: "wrong channel", parentId: root.id }), "invalid");
    const top = await listMessages(A(), ids.ann, general, { limit: 100 });
    expect(top.messages.some((m) => m.id === reply.id)).toBe(false); // replies stay out of the channel timeline
    expect(top.messages.find((m) => m.id === root.id)!.replyCount).toBe(1);
    const thread = await listThread(A(), ids.ann, general, root.id);
    expect(thread.replies.map((m) => m.body)).toEqual(["in thread"]);
    await rejects(listThread(A(), ids.cat, secret, root.id), "not_found");
  });

  it("reactions toggle, are limited to the allowed set, and need membership", async () => {
    const msg = (await listMessages(A(), ids.ann, general, { limit: 1 })).messages[0]!;
    let r = await toggleReaction(A(), ids.ann, msg.id, "👍");
    expect(r.reactions).toEqual([{ emoji: "👍", userIds: [ids.ann] }]);
    r = await toggleReaction(A(), ids.bob, msg.id, "👍");
    expect(r.reactions[0]!.userIds).toEqual([ids.ann, ids.bob]);
    r = await toggleReaction(A(), ids.ann, msg.id, "👍");
    expect(r.reactions).toEqual([{ emoji: "👍", userIds: [ids.bob] }]);
    await rejects(toggleReaction(A(), ids.ann, msg.id, "💩"), "invalid");
    await rejects(toggleReaction(A(), ids.cat, msg.id, "👍"), "not_found"); // cat is not in #general
  });

  it("only authors edit; authors and admins delete; deleted text is gone", async () => {
    const mine = await sendMessage(A(), ids.bob, { channelId: general, body: "typo" });
    const edited = await editMessage(A(), ids.bob, mine.id, "fixed");
    expect(edited.body).toBe("fixed");
    expect(edited.editedAt).not.toBeNull();
    await rejects(editMessage(A(), ids.ann, mine.id, "hijack"), "forbidden");
    await rejects(deleteMessage(A(), { userId: ids.cat, role: "MEMBER" }, mine.id), "not_found");
    const other = await sendMessage(A(), ids.ann, { channelId: general, body: "owner message" });
    await rejects(deleteMessage(A(), bob(), other.id), "forbidden");
    await deleteMessage(A(), ann(), mine.id); // an admin may remove someone else's
    const after = (await listMessages(A(), ids.ann, general, { limit: 100 })).messages.find((m) => m.id === mine.id)!;
    expect(after.deleted).toBe(true);
    expect(after.body).toBe("");
    await rejects(editMessage(A(), ids.bob, mine.id, "undelete"), "invalid");
    await rejects(toggleReaction(A(), ids.ann, mine.id, "👍"), "invalid");
  });

  it("direct messages are reused for the same people and refused to guests", async () => {
    const first = await openDm(A(), ann(), [ids.bob]);
    expect(first.created).toBe(true);
    expect(first.channel.kind).toBe("DM");
    dm = first.channel.id;
    const again = await openDm(A(), bob(), [ids.ann]);
    expect(again.created).toBe(false);
    expect(again.channel.id).toBe(dm);
    const group = await openDm(A(), ann(), [ids.bob, ids.cat]);
    expect(group.channel.kind).toBe("GROUP");
    const self = await openDm(A(), ann(), []);
    expect(self.channel.members).toHaveLength(1);
    await rejects(openDm(A(), guest(), [ids.ann]), "forbidden");
    await rejects(openDm(A(), ann(), [ids.eve]), "invalid"); // eve is in another workspace
    await rejects(getChannelForUser(A(), dm, ids.cat), "not_found");
  });

  it("another workspace cannot see any of it", async () => {
    expect(await B().channel.count()).toBe(0);
    expect(await B().message.count()).toBe(0);
    await rejects(getChannelForUser(B(), general, ids.eve), "not_found");
    await rejects(sendMessage(B(), ids.eve, { channelId: general, body: "cross-tenant" }), "not_found");
    await rejects(openDm(B(), { userId: ids.eve, role: "OWNER" }, [ids.ann]), "invalid");
    expect(await listChannelsForUser(B(), ids.eve)).toEqual([]);
  });
});
