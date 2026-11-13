import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma, tenantDb, type Membership, type TenantDb, type User, type Workspace } from "@orbit/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import { syncMembershipsForUser, upsertUser } from "./sync";

/** The signed-in user's Orbit record, created on first visit. Redirects to sign-in otherwise. */
export const requireUser = cache(async (): Promise<User> => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) return redirectToSignIn();
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? `${userId}@users.invalid`;
  return upsertUser({
    clerkId: userId,
    email,
    name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "",
    imageUrl: clerkUser.hasImage ? clerkUser.imageUrl : null,
  });
});

export type WorkspaceContext = {
  user: User;
  workspace: Workspace;
  membership: Membership;
  /** Tenant-scoped database client. Use this, not `prisma`, for workspace data. */
  db: TenantDb;
};

async function findMembership(slug: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) return null;
  const db = tenantDb(workspace.id);
  const membership = await db.membership.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
  });
  return membership ? { workspace, membership, db } : null;
}

/**
 * Resolve the workspace in the URL and prove the signed-in user belongs to
 * it. A workspace the user is not a member of is indistinguishable from one
 * that does not exist (404), so slugs cannot be probed.
 */
export const requireWorkspace = cache(async (slug: string): Promise<WorkspaceContext> => {
  const user = await requireUser();
  let found = await findMembership(slug, user.id);
  if (!found) {
    // Perhaps they just joined and the webhook has not arrived yet.
    await syncMembershipsForUser(user);
    found = await findMembership(slug, user.id);
  }
  if (!found) notFound();
  return { user, ...found };
});

/** Workspaces the user belongs to, for the switcher. */
export async function listWorkspaces(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}
