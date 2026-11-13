import { isAtLeast, roleRank, type RoleName } from "./roles";

/** Minimum role for each action. Extended in later phases. */
export const PERMISSIONS = {
  "workspace:view": "GUEST",
  "workspace:update": "ADMIN",
  "workspace:delete": "OWNER",
  "members:view": "MEMBER",
  "members:invite": "ADMIN",
  "members:remove": "ADMIN",
  "members:change-role": "ADMIN",
  "invitations:view": "ADMIN",
  "invitations:revoke": "ADMIN",
  "billing:manage": "OWNER",
  "audit-log:view": "ADMIN",
} as const satisfies Record<string, RoleName>;

export type Permission = keyof typeof PERMISSIONS;

export class PermissionError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

export function can(role: RoleName | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return isAtLeast(role, PERMISSIONS[permission]);
}

export function assertCan(role: RoleName | null | undefined, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionError(permission);
}

/** Roles an actor may hand out when inviting. Nobody can invite an owner. */
export function invitableRoles(actor: RoleName | null | undefined): RoleName[] {
  if (!can(actor, "members:invite")) return [];
  return actor === "OWNER" ? ["ADMIN", "MEMBER", "GUEST"] : ["MEMBER", "GUEST"];
}

type Subject = { role: RoleName; userId: string };

/**
 * Can `actor` change `target` to role `next`?
 * Nobody changes their own role, ownership is never assigned here, and an
 * admin can only manage people ranked below them, into roles below their own.
 */
export function canChangeRole(actor: Subject, target: Subject, next: RoleName): boolean {
  if (!can(actor.role, "members:change-role")) return false;
  if (actor.userId === target.userId) return false;
  if (next === "OWNER" || target.role === "OWNER") return false;
  if (actor.role === "OWNER") return true;
  return roleRank(target.role) < roleRank(actor.role) && roleRank(next) < roleRank(actor.role);
}

/** Can `actor` remove `target` from the workspace? Owners cannot be removed. */
export function canRemoveMember(actor: Subject, target: Subject): boolean {
  if (!can(actor.role, "members:remove")) return false;
  if (target.role === "OWNER") return false;
  if (actor.userId === target.userId) return false;
  if (actor.role === "OWNER") return true;
  return roleRank(target.role) < roleRank(actor.role);
}
