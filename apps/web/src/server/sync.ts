/**
 * Keeps Orbit's database in step with Clerk. Clerk owns identity (users,
 * organizations, who belongs where); Orbit's database owns roles and every
 * tenant-scoped row. These functions are called from the Clerk webhook and,
 * as a fallback that needs no webhook, when a signed-in user enters the app.
 */
import { clerkClient } from "@clerk/nextjs/server";
import { Prisma, prisma, reconcileRole, removeMemberData, slugify, tenantDb, type User, type Workspace } from "@orbit/db";

export type ClerkUserData = { clerkId: string; email: string; name: string; imageUrl?: string | null };
export type ClerkOrgData = { clerkOrgId: string; name: string; imageUrl?: string | null; createdBy?: string | null };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function upsertUser(data: ClerkUserData): Promise<User> {
  const fields = { email: data.email, name: data.name || data.email.split("@")[0] || "User", imageUrl: data.imageUrl ?? null };
  const byClerkId = await prisma.user.findUnique({ where: { clerkId: data.clerkId } });
  if (byClerkId) return prisma.user.update({ where: { id: byClerkId.id }, data: fields });

  // Same person under a new Clerk id (for example after moving from keyless
  // development keys to a real Clerk application): keep their Orbit account.
  const byEmail = await prisma.user.findUnique({ where: { email: data.email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { ...fields, clerkId: data.clerkId } });

  try {
    return await prisma.user.create({ data: { clerkId: data.clerkId, ...fields } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return prisma.user.findUniqueOrThrow({ where: { clerkId: data.clerkId } }); // lost a race with the webhook
  }
}

export async function deleteUserByClerkId(clerkId: string): Promise<void> {
  await prisma.user.deleteMany({ where: { clerkId } });
}

export async function upsertWorkspace(data: ClerkOrgData): Promise<Workspace> {
  const existing = await prisma.workspace.findUnique({ where: { clerkOrgId: data.clerkOrgId } });
  if (existing) {
    return prisma.workspace.update({
      where: { id: existing.id },
      data: { name: data.name, imageUrl: data.imageUrl ?? null },
    });
  }
  const base = slugify(data.name);
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      return await prisma.workspace.create({
        data: { clerkOrgId: data.clerkOrgId, name: data.name, slug, imageUrl: data.imageUrl ?? null },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.workspace.findUnique({ where: { clerkOrgId: data.clerkOrgId } });
      if (raced) return raced; // created concurrently; otherwise the slug was taken, try the next
    }
  }
  throw new Error(`Could not find a free slug for workspace "${data.name}".`);
}

export async function deleteWorkspaceByClerkOrgId(clerkOrgId: string): Promise<void> {
  await prisma.workspace.deleteMany({ where: { clerkOrgId } });
}

export async function upsertMembership(input: {
  workspace: Workspace;
  user: User;
  clerkRole: string;
  clerkMembershipId?: string | null;
  isCreator?: boolean;
}) {
  const db = tenantDb(input.workspace.id);
  const key = { workspaceId_userId: { workspaceId: input.workspace.id, userId: input.user.id } };
  const current = await db.membership.findUnique({ where: key });

  let invitedRole = null;
  if (!current) {
    const invitation = await db.invitation.findFirst({
      where: { email: { equals: input.user.email, mode: "insensitive" }, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (invitation) {
      invitedRole = invitation.role;
      await db.invitation.updateMany({
        where: { email: { equals: input.user.email, mode: "insensitive" }, status: "PENDING" },
        data: { status: "ACCEPTED" },
      });
    }
  }

  const role = reconcileRole(input.clerkRole, { current: current?.role, isCreator: input.isCreator, invitedRole });
  const clerkMembershipId = input.clerkMembershipId ?? current?.clerkMembershipId ?? null;
  if (current) {
    if (current.role === role && current.clerkMembershipId === clerkMembershipId) return current;
    return db.membership.update({ where: { id: current.id }, data: { role, clerkMembershipId } });
  }
  try {
    return await db.membership.create({
      data: { workspaceId: input.workspace.id, userId: input.user.id, role, clerkMembershipId },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return db.membership.findUniqueOrThrow({ where: key });
  }
}

export async function deleteMembership(clerkOrgId: string, clerkUserId: string): Promise<void> {
  const [workspace, user] = await Promise.all([
    prisma.workspace.findUnique({ where: { clerkOrgId } }),
    prisma.user.findUnique({ where: { clerkId: clerkUserId } }),
  ]);
  if (!workspace || !user) return;
  const db = tenantDb(workspace.id);
  await db.membership.deleteMany({ where: { userId: user.id } });
  await removeMemberData(db, user.id);
}

/**
 * Pull the user's organization memberships from Clerk and mirror them.
 * Returns the user's workspaces, oldest membership first.
 */
export async function syncMembershipsForUser(user: User): Promise<Workspace[]> {
  const clerk = await clerkClient();
  const { data } = await clerk.users.getOrganizationMembershipList({ userId: user.clerkId, limit: 100 });

  const workspaces: Workspace[] = [];
  for (const membership of data) {
    const org = membership.organization;
    const workspace = await upsertWorkspace({
      clerkOrgId: org.id,
      name: org.name,
      imageUrl: org.hasImage ? org.imageUrl : null,
      createdBy: org.createdBy,
    });
    await upsertMembership({
      workspace,
      user,
      clerkRole: membership.role,
      clerkMembershipId: membership.id,
      isCreator: org.createdBy === user.clerkId,
    });
    workspaces.push(workspace);
  }

  // Remove memberships Clerk no longer has. Only trust a complete listing.
  if (data.length < 100) {
    const gone = await prisma.membership.findMany({
      where: { userId: user.id, workspaceId: { notIn: workspaces.map((w) => w.id) } },
      select: { workspaceId: true },
    });
    for (const { workspaceId } of gone) {
      const db = tenantDb(workspaceId);
      await db.membership.deleteMany({ where: { userId: user.id } });
      await removeMemberData(db, user.id);
    }
  }
  return workspaces;
}
