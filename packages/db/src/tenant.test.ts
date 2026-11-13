import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_MODELS, TenantIsolationError, scopeArgs } from "./tenant";

const WS = "ws_a";
const OTHER = "ws_b";

describe("TENANT_MODELS", () => {
  it("lists every model in the schema that has a workspaceId column", () => {
    const schema = readFileSync(path.resolve(import.meta.dirname, "../prisma/schema.prisma"), "utf8");
    const withWorkspaceId = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s*workspaceId\s+String/m.test(body ?? ""))
      .map(([, name]) => name)
      .sort();
    expect([...TENANT_MODELS].sort()).toEqual(withWorkspaceId);
  });
});

describe("scopeArgs() reads", () => {
  for (const op of ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]) {
    it(`adds the tenant filter to ${op} with no where`, () => {
      expect(scopeArgs("Membership", op, undefined, WS).where).toEqual({ AND: [{ workspaceId: WS }] });
    });
  }

  it("keeps the caller's filter and ANDs the tenant filter", () => {
    const out = scopeArgs("Membership", "findMany", { where: { role: "ADMIN" }, take: 5 }, WS);
    expect(out).toEqual({ where: { role: "ADMIN", AND: [{ workspaceId: WS }] }, take: 5 });
  });

  it("cannot be widened with OR", () => {
    const out = scopeArgs("Membership", "findMany", { where: { OR: [{ workspaceId: OTHER }, {}] } }, WS);
    expect(out.where).toEqual({ OR: [{ workspaceId: OTHER }, {}], AND: [{ workspaceId: WS }] });
  });

  it("cannot be overridden by passing another workspaceId", () => {
    const out = scopeArgs("Membership", "findMany", { where: { workspaceId: OTHER } }, WS);
    // Both conditions apply, so the query matches nothing rather than the other tenant.
    expect(out.where).toEqual({ workspaceId: OTHER, AND: [{ workspaceId: WS }] });
  });

  it("appends to an existing AND (array or object)", () => {
    expect(scopeArgs("Invitation", "findMany", { where: { AND: [{ email: "a@b.c" }] } }, WS).where).toEqual({
      AND: [{ email: "a@b.c" }, { workspaceId: WS }],
    });
    expect(scopeArgs("Invitation", "findMany", { where: { AND: { email: "a@b.c" } } }, WS).where).toEqual({
      AND: [{ email: "a@b.c" }, { workspaceId: WS }],
    });
  });

  it("keeps unique fields at the top level for findUnique", () => {
    const out = scopeArgs("Membership", "findUnique", { where: { id: "m1" } }, WS);
    expect(out.where).toEqual({ id: "m1", AND: [{ workspaceId: WS }] });
  });

  it("does not mutate the caller's arguments", () => {
    const args = { where: { role: "ADMIN" } };
    scopeArgs("Membership", "findMany", args, WS);
    expect(args).toEqual({ where: { role: "ADMIN" } });
  });
});

describe("scopeArgs() writes", () => {
  it("stamps workspaceId on create", () => {
    const out = scopeArgs("Membership", "create", { data: { userId: "u1", role: "MEMBER" } }, WS);
    expect(out.data).toEqual({ userId: "u1", role: "MEMBER", workspaceId: WS });
  });

  it("stamps every row of createMany", () => {
    const out = scopeArgs("Invitation", "createMany", { data: [{ email: "a@b.c" }, { email: "d@e.f" }] }, WS);
    expect(out.data).toEqual([
      { email: "a@b.c", workspaceId: WS },
      { email: "d@e.f", workspaceId: WS },
    ]);
  });

  it("rejects creating a row for another workspace", () => {
    expect(() => scopeArgs("Membership", "create", { data: { userId: "u1", workspaceId: OTHER } }, WS)).toThrow(
      TenantIsolationError,
    );
    expect(() =>
      scopeArgs("Membership", "createMany", { data: [{ userId: "u1" }, { userId: "u2", workspaceId: OTHER }] }, WS),
    ).toThrow(TenantIsolationError);
  });

  it("rejects connecting through the workspace relation", () => {
    expect(() =>
      scopeArgs("Membership", "create", { data: { userId: "u1", workspace: { connect: { id: OTHER } } } }, WS),
    ).toThrow(TenantIsolationError);
  });

  for (const op of ["update", "updateMany", "delete", "deleteMany"]) {
    it(`adds the tenant filter to ${op}`, () => {
      const out = scopeArgs("Membership", op, { where: { id: "m1" }, data: { role: "ADMIN" } }, WS);
      expect(out.where).toEqual({ id: "m1", AND: [{ workspaceId: WS }] });
    });
  }

  it("rejects moving a row to another workspace", () => {
    expect(() =>
      scopeArgs("Membership", "update", { where: { id: "m1" }, data: { workspaceId: OTHER } }, WS),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgs("Membership", "updateMany", { where: {}, data: { workspaceId: { set: OTHER } } }, WS),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgs("Membership", "update", { where: { id: "m1" }, data: { workspace: { connect: { id: OTHER } } } }, WS),
    ).toThrow(TenantIsolationError);
  });

  it("scopes all three parts of an upsert", () => {
    const out = scopeArgs(
      "Membership",
      "upsert",
      { where: { id: "m1" }, create: { userId: "u1" }, update: { role: "ADMIN" } },
      WS,
    );
    expect(out).toEqual({
      where: { id: "m1", AND: [{ workspaceId: WS }] },
      create: { userId: "u1", workspaceId: WS },
      update: { role: "ADMIN" },
    });
    expect(() =>
      scopeArgs("Membership", "upsert", { where: { id: "m1" }, create: { userId: "u1", workspaceId: OTHER }, update: {} }, WS),
    ).toThrow(TenantIsolationError);
    expect(() =>
      scopeArgs("Membership", "upsert", { where: { id: "m1" }, create: { userId: "u1" }, update: { workspaceId: OTHER } }, WS),
    ).toThrow(TenantIsolationError);
  });
});

describe("scopeArgs() guards", () => {
  it("refuses operations it does not know how to scope", () => {
    expect(() => scopeArgs("Membership", "someFutureOperation", {}, WS)).toThrow(TenantIsolationError);
  });

  it("requires a workspace id", () => {
    expect(() => scopeArgs("Membership", "findMany", {}, "")).toThrow(TenantIsolationError);
  });

  it("leaves global models untouched", () => {
    expect(scopeArgs("User", "findMany", { where: { email: "a@b.c" } }, WS)).toEqual({ where: { email: "a@b.c" } });
  });
});
