import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PermissionError,
  assertCan,
  can,
  canChangeRole,
  canRemoveMember,
  invitableRoles,
  type Permission,
} from "./permissions";
import { ROLES, clerkRoleFor, isAtLeast, reconcileRole, roleFromClerk, slugify, type RoleName } from "./roles";

const owner = { role: "OWNER", userId: "u_owner" } as const;
const admin = { role: "ADMIN", userId: "u_admin" } as const;
const admin2 = { role: "ADMIN", userId: "u_admin2" } as const;
const member = { role: "MEMBER", userId: "u_member" } as const;
const guest = { role: "GUEST", userId: "u_guest" } as const;

describe("can()", () => {
  // The full matrix, spelled out so a change to PERMISSIONS has to be deliberate.
  const expected: Record<Permission, RoleName[]> = {
    "workspace:view": ["OWNER", "ADMIN", "MEMBER", "GUEST"],
    "workspace:update": ["OWNER", "ADMIN"],
    "workspace:delete": ["OWNER"],
    "members:view": ["OWNER", "ADMIN", "MEMBER"],
    "members:invite": ["OWNER", "ADMIN"],
    "members:remove": ["OWNER", "ADMIN"],
    "members:change-role": ["OWNER", "ADMIN"],
    "invitations:view": ["OWNER", "ADMIN"],
    "invitations:revoke": ["OWNER", "ADMIN"],
    "billing:manage": ["OWNER"],
    "audit-log:view": ["OWNER", "ADMIN"],
  };

  it("covers every permission", () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(PERMISSIONS).sort());
  });

  for (const permission of Object.keys(expected) as Permission[]) {
    for (const role of ROLES) {
      const allowed = expected[permission].includes(role);
      it(`${role} ${allowed ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(allowed);
      });
    }
  }

  it("denies everything to a non-member", () => {
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("assertCan throws a PermissionError naming the permission", () => {
    expect(() => assertCan("MEMBER", "members:invite")).toThrow(PermissionError);
    expect(() => assertCan("ADMIN", "members:invite")).not.toThrow();
    try {
      assertCan("GUEST", "billing:manage");
    } catch (error) {
      expect((error as PermissionError).permission).toBe("billing:manage");
    }
  });
});

describe("invitableRoles()", () => {
  it("lets owners invite admins, members and guests", () => {
    expect(invitableRoles("OWNER")).toEqual(["ADMIN", "MEMBER", "GUEST"]);
  });
  it("lets admins invite only below their own rank", () => {
    expect(invitableRoles("ADMIN")).toEqual(["MEMBER", "GUEST"]);
  });
  it("gives members, guests and non-members nothing", () => {
    expect(invitableRoles("MEMBER")).toEqual([]);
    expect(invitableRoles("GUEST")).toEqual([]);
    expect(invitableRoles(null)).toEqual([]);
  });
  it("never offers OWNER", () => {
    for (const role of ROLES) expect(invitableRoles(role)).not.toContain("OWNER");
  });
});

describe("canChangeRole()", () => {
  it("lets an owner promote and demote anyone but owners", () => {
    expect(canChangeRole(owner, member, "ADMIN")).toBe(true);
    expect(canChangeRole(owner, admin, "MEMBER")).toBe(true);
    expect(canChangeRole(owner, guest, "MEMBER")).toBe(true);
  });
  it("never assigns or removes ownership", () => {
    expect(canChangeRole(owner, admin, "OWNER")).toBe(false);
    expect(canChangeRole(admin, owner, "MEMBER")).toBe(false);
    expect(canChangeRole({ role: "OWNER", userId: "u_other_owner" }, owner, "ADMIN")).toBe(false);
  });
  it("stops anyone changing their own role", () => {
    expect(canChangeRole(owner, owner, "ADMIN")).toBe(false);
    expect(canChangeRole(admin, admin, "MEMBER")).toBe(false);
  });
  it("lets an admin manage members and guests only", () => {
    expect(canChangeRole(admin, member, "GUEST")).toBe(true);
    expect(canChangeRole(admin, guest, "MEMBER")).toBe(true);
    expect(canChangeRole(admin, member, "ADMIN")).toBe(false);
    expect(canChangeRole(admin, admin2, "MEMBER")).toBe(false);
  });
  it("denies members and guests", () => {
    expect(canChangeRole(member, guest, "MEMBER")).toBe(false);
    expect(canChangeRole(guest, member, "GUEST")).toBe(false);
  });
});

describe("canRemoveMember()", () => {
  it("protects owners", () => {
    expect(canRemoveMember(admin, owner)).toBe(false);
    expect(canRemoveMember({ role: "OWNER", userId: "u_other_owner" }, owner)).toBe(false);
  });
  it("lets owners remove admins, members and guests", () => {
    expect(canRemoveMember(owner, admin)).toBe(true);
    expect(canRemoveMember(owner, member)).toBe(true);
    expect(canRemoveMember(owner, guest)).toBe(true);
  });
  it("lets admins remove only lower ranks", () => {
    expect(canRemoveMember(admin, member)).toBe(true);
    expect(canRemoveMember(admin, guest)).toBe(true);
    expect(canRemoveMember(admin, admin2)).toBe(false);
  });
  it("denies self-removal and lower roles", () => {
    expect(canRemoveMember(admin, admin)).toBe(false);
    expect(canRemoveMember(member, guest)).toBe(false);
    expect(canRemoveMember(guest, member)).toBe(false);
  });
});

describe("roles", () => {
  it("orders roles guest < member < admin < owner", () => {
    expect(isAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(isAtLeast("ADMIN", "ADMIN")).toBe(true);
    expect(isAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(isAtLeast("GUEST", "MEMBER")).toBe(false);
  });

  it("maps Clerk roles", () => {
    expect(roleFromClerk("org:admin")).toBe("ADMIN");
    expect(roleFromClerk("org:member")).toBe("MEMBER");
    expect(roleFromClerk("org:guest")).toBe("GUEST");
    expect(roleFromClerk("org:something-new")).toBe("MEMBER");
  });

  it("makes the organization creator the owner on first sync", () => {
    expect(reconcileRole("org:admin", { isCreator: true })).toBe("OWNER");
    expect(reconcileRole("org:admin")).toBe("ADMIN");
    expect(reconcileRole("org:member")).toBe("MEMBER");
  });

  it("honours an invited guest role but never grants more than Clerk did", () => {
    expect(reconcileRole("org:member", { invitedRole: "GUEST" })).toBe("GUEST");
    expect(reconcileRole("org:member", { invitedRole: "ADMIN" })).toBe("MEMBER");
    expect(reconcileRole("org:member", { invitedRole: "OWNER" })).toBe("MEMBER");
    expect(reconcileRole("org:admin", { invitedRole: "GUEST" })).toBe("ADMIN");
  });

  it("never changes an existing owner", () => {
    expect(reconcileRole("org:member", { current: "OWNER" })).toBe("OWNER");
    expect(reconcileRole("org:admin", { current: "OWNER" })).toBe("OWNER");
  });

  it("follows Clerk for admin promotion and demotion, and keeps guests as guests", () => {
    expect(reconcileRole("org:admin", { current: "MEMBER" })).toBe("ADMIN");
    expect(reconcileRole("org:member", { current: "ADMIN" })).toBe("MEMBER");
    expect(reconcileRole("org:member", { current: "GUEST" })).toBe("GUEST");
    expect(reconcileRole("org:member", { current: "MEMBER" })).toBe("MEMBER");
    // A later sync cannot turn an existing member into an owner.
    expect(reconcileRole("org:admin", { current: "MEMBER", isCreator: true })).toBe("ADMIN");
  });

  it("maps Orbit roles back to Clerk roles", () => {
    expect(clerkRoleFor("OWNER")).toBe("org:admin");
    expect(clerkRoleFor("ADMIN")).toBe("org:admin");
    expect(clerkRoleFor("MEMBER")).toBe("org:member");
    expect(clerkRoleFor("GUEST")).toBe("org:member");
  });

  it("slugifies names", () => {
    expect(slugify("Acme Inc.")).toBe("acme-inc");
    expect(slugify("  Café  Zürich! ")).toBe("cafe-zurich");
    expect(slugify("!!!")).toBe("workspace");
    expect(slugify("a".repeat(80))).toHaveLength(40);
  });
});
