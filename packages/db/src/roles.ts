/** Role helpers with no database import, safe for client components. */

export const ROLES = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;
export type RoleName = (typeof ROLES)[number];

const RANK: Record<RoleName, number> = { GUEST: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const ROLE_LABEL: Record<RoleName, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  GUEST: "Guest",
};

export function roleRank(role: RoleName): number {
  return RANK[role];
}

export function isAtLeast(role: RoleName, minimum: RoleName): boolean {
  return RANK[role] >= RANK[minimum];
}

/** Clerk's built-in organization role keys. */
export const CLERK_ROLE = { ADMIN: "org:admin", MEMBER: "org:member" } as const;

function isClerkAdmin(clerkRole: string): boolean {
  return clerkRole === "org:admin" || clerkRole === "admin";
}

/** Map a Clerk organization role to an Orbit role (never OWNER). */
export function roleFromClerk(clerkRole: string): Exclude<RoleName, "OWNER"> {
  if (isClerkAdmin(clerkRole)) return "ADMIN";
  if (clerkRole === "org:guest" || clerkRole === "guest") return "GUEST";
  return "MEMBER";
}

/**
 * Decide the Orbit role when a Clerk membership is synced.
 *
 * Orbit's database owns roles; Clerk only knows admin vs member. So:
 * - a new membership is OWNER for the organization's creator, otherwise the
 *   role promised by a pending Orbit invitation (never above what Clerk
 *   granted), otherwise the mapped Clerk role;
 * - an existing OWNER is never changed by a sync;
 * - Clerk admin-ness wins for ADMIN (promotion and demotion), while MEMBER
 *   and GUEST, which Clerk cannot tell apart, are preserved.
 */
export function reconcileRole(
  clerkRole: string,
  opts: { current?: RoleName | null; isCreator?: boolean; invitedRole?: RoleName | null } = {},
): RoleName {
  const mapped = roleFromClerk(clerkRole);
  const { current } = opts;
  if (!current) {
    if (opts.isCreator) return "OWNER";
    if (mapped === "ADMIN") return "ADMIN";
    return opts.invitedRole === "GUEST" ? "GUEST" : mapped;
  }
  if (current === "OWNER") return "OWNER";
  if (mapped === "ADMIN") return "ADMIN";
  if (current === "ADMIN") return mapped;
  return current;
}

/**
 * Clerk role for an Orbit role. Guests are plain members in Clerk (the
 * distinction lives in Orbit's database), so no custom Clerk role is needed.
 */
export function clerkRoleFor(role: RoleName): string {
  return role === "OWNER" || role === "ADMIN" ? CLERK_ROLE.ADMIN : CLERK_ROLE.MEMBER;
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "workspace";
}
