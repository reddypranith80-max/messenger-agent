/**
 * Tenant isolation against a real database. Skipped when DATABASE_URL is not
 * set (for example in a checkout with no .env); run `pnpm db:dev` for a local
 * Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "./client";
import { TenantIsolationError, tenantDb } from "./tenant";

const hasDb = Boolean(process.env.DATABASE_URL);
const run = `t${Date.now().toString(36)}`;

describe.skipIf(!hasDb)("tenantDb() against Postgres", () => {
  const ids = { a: "", b: "", alice: "", bob: "", carol: "", aliceInA: "", bobInB: "" };

  beforeAll(async () => {
    const db = getPrisma();
    const [a, b] = await Promise.all(
      ["a", "b"].map((k) =>
        db.workspace.create({ data: { clerkOrgId: `org_${run}_${k}`, name: `WS ${k}`, slug: `${run}-${k}` } }),
      ),
    );
    const [alice, bob, carol] = await Promise.all(
      ["alice", "bob", "carol"].map((n) =>
        db.user.create({ data: { clerkId: `user_${run}_${n}`, email: `${n}.${run}@example.test`, name: n } }),
      ),
    );
    ids.a = a!.id;
    ids.b = b!.id;
    ids.alice = alice!.id;
    ids.bob = bob!.id;
    ids.carol = carol!.id;
    ids.aliceInA = (await db.membership.create({ data: { workspaceId: ids.a, userId: ids.alice, role: "OWNER" } })).id;
    ids.bobInB = (await db.membership.create({ data: { workspaceId: ids.b, userId: ids.bob, role: "OWNER" } })).id;
    await db.invitation.create({ data: { workspaceId: ids.b, email: `secret.${run}@example.test` } });
  });

  afterAll(async () => {
    const db = getPrisma();
    await db.workspace.deleteMany({ where: { id: { in: [ids.a, ids.b] } } });
    await db.user.deleteMany({ where: { id: { in: [ids.alice, ids.bob, ids.carol] } } });
    await db.$disconnect();
  });

  it("lists only the workspace's own rows", async () => {
    const inA = await tenantDb(ids.a).membership.findMany();
    expect(inA.map((m) => m.id)).toEqual([ids.aliceInA]);
    expect(await tenantDb(ids.a).invitation.count()).toBe(0);
    expect(await tenantDb(ids.b).invitation.count()).toBe(1);
  });

  it("cannot read another workspace's row by id", async () => {
    expect(await tenantDb(ids.a).membership.findUnique({ where: { id: ids.bobInB } })).toBeNull();
    expect(await tenantDb(ids.a).membership.findFirst({ where: { id: ids.bobInB } })).toBeNull();
    expect(await tenantDb(ids.b).membership.findUnique({ where: { id: ids.bobInB } })).not.toBeNull();
  });

  it("cannot widen a query with an explicit workspaceId or OR", async () => {
    expect(await tenantDb(ids.a).membership.findMany({ where: { workspaceId: ids.b } })).toEqual([]);
    const viaOr = await tenantDb(ids.a).membership.findMany({ where: { OR: [{ workspaceId: ids.b }, { id: ids.bobInB }] } });
    expect(viaOr).toEqual([]);
  });

  it("cannot update or delete another workspace's row", async () => {
    await expect(
      tenantDb(ids.a).membership.update({ where: { id: ids.bobInB }, data: { role: "GUEST" } }),
    ).rejects.toThrow();
    expect((await tenantDb(ids.a).membership.updateMany({ where: { id: ids.bobInB }, data: { role: "GUEST" } })).count).toBe(0);
    await expect(tenantDb(ids.a).membership.delete({ where: { id: ids.bobInB } })).rejects.toThrow();
    expect((await tenantDb(ids.a).membership.deleteMany({})).count).toBe(1); // only alice's
    const bob = await getPrisma().membership.findUnique({ where: { id: ids.bobInB } });
    expect(bob?.role).toBe("OWNER");
  });

  it("stamps the workspace on create and refuses a foreign one", async () => {
    const created = await tenantDb(ids.a).membership.create({
      data: { userId: ids.carol, role: "MEMBER" } as never,
    });
    expect(created.workspaceId).toBe(ids.a);
    await expect(
      tenantDb(ids.a).membership.create({ data: { userId: ids.bob, workspaceId: ids.b, role: "ADMIN" } }),
    ).rejects.toThrow(TenantIsolationError);
    expect(await getPrisma().membership.count({ where: { workspaceId: ids.b } })).toBe(1);
  });

  it("refuses to move a row to another workspace", async () => {
    const carol = await tenantDb(ids.a).membership.findFirstOrThrow({ where: { userId: ids.carol } });
    await expect(
      tenantDb(ids.a).membership.update({ where: { id: carol.id }, data: { workspaceId: ids.b } }),
    ).rejects.toThrow(TenantIsolationError);
  });
});
