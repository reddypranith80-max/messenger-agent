"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import {
  PermissionError,
  assertCan,
  canChangeRole,
  canRemoveMember,
  clerkRoleFor,
  invitableRoles,
  prisma,
} from "@orbit/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, requireWorkspace } from "./context";
import { upsertMembership, upsertWorkspace } from "./sync";

export type ActionState = { ok: boolean; message?: string; error?: string };

function failure(error: unknown, fallback: string): ActionState {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? fallback };
  if (error instanceof PermissionError) return { ok: false, error: "You do not have permission to do that." };
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return { ok: false, error: first?.longMessage ?? first?.message ?? fallback };
  }
  console.error(error);
  return { ok: false, error: fallback };
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------- workspaces

const workspaceName = z.string().trim().min(2, "Give the workspace a name of at least 2 characters.").max(50, "Keep the name under 50 characters.");

export async function createWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  let slug: string;
  try {
    const name = workspaceName.parse(formData.get("name"));
    const clerk = await clerkClient();
    const org = await clerk.organizations.createOrganization({ name, createdBy: user.clerkId });
    const workspace = await upsertWorkspace({ clerkOrgId: org.id, name: org.name, createdBy: user.clerkId });
    await upsertMembership({ workspace, user, clerkRole: "org:admin", isCreator: true });
    slug = workspace.slug;
  } catch (error) {
    return failure(error, "Could not create the workspace. Check that Organizations are enabled in Clerk.");
  }
  redirect(`/w/${slug}/chat`);
}

// ------------------------------------------------------------------- profile

const profileSchema = z.object({
  presence: z.enum(["ONLINE", "AWAY", "BUSY", "OFFLINE"]),
  statusText: z.string().trim().max(80, "Keep your status under 80 characters."),
});

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const data = profileSchema.parse({
      presence: formData.get("presence"),
      statusText: formData.get("statusText") ?? "",
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { presence: data.presence, statusText: data.statusText || null, lastSeenAt: new Date() },
    });
  } catch (error) {
    return failure(error, "Could not save your profile.");
  }
  revalidatePath("/w", "layout");
  return { ok: true, message: "Saved" };
}

// ------------------------------------------------------------------- members

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
});

export async function inviteMember(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  try {
    assertCan(membership.role, "members:invite");
    const { email, role } = inviteSchema.parse({ email: formData.get("email"), role: formData.get("role") });
    if (!invitableRoles(membership.role).includes(role)) throw new PermissionError("members:invite");

    const alreadyMember = await db.membership.findFirst({
      where: { user: { email: { equals: email, mode: "insensitive" } } },
    });
    if (alreadyMember) return { ok: false, error: "That person is already in this workspace." };

    const clerk = await clerkClient();
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: workspace.clerkOrgId,
      inviterUserId: user.clerkId,
      emailAddress: email,
      role: clerkRoleFor(role),
      redirectUrl: `${appUrl()}/sign-up`,
    });
    await db.invitation.create({
      data: { workspaceId: workspace.id, email, role, clerkInvitationId: invitation.id, invitedById: user.id },
    });
  } catch (error) {
    return failure(error, "Could not send the invitation.");
  }
  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, message: "Invitation sent" };
}

export async function revokeInvitation(slug: string, invitationId: string): Promise<ActionState> {
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  try {
    assertCan(membership.role, "invitations:revoke");
    const invitation = await db.invitation.findUnique({ where: { id: z.string().min(1).parse(invitationId) } });
    if (!invitation || invitation.status !== "PENDING") return { ok: false, error: "That invitation is no longer pending." };
    if (invitation.clerkInvitationId) {
      const clerk = await clerkClient();
      await clerk.organizations.revokeOrganizationInvitation({
        organizationId: workspace.clerkOrgId,
        invitationId: invitation.clerkInvitationId,
        requestingUserId: user.clerkId,
      });
    }
    await db.invitation.update({ where: { id: invitation.id }, data: { status: "REVOKED" } });
  } catch (error) {
    return failure(error, "Could not revoke the invitation.");
  }
  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, message: "Invitation revoked" };
}

const roleChange = z.object({ membershipId: z.string().min(1), role: z.enum(["ADMIN", "MEMBER", "GUEST"]) });

export async function changeMemberRole(slug: string, membershipId: string, role: string): Promise<ActionState> {
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  try {
    const input = roleChange.parse({ membershipId, role });
    // Scoped lookup: a membership id from another workspace is simply not found.
    const target = await db.membership.findUnique({ where: { id: input.membershipId }, include: { user: true } });
    if (!target) return { ok: false, error: "Member not found." };
    const actor = { role: membership.role, userId: user.id };
    if (!canChangeRole(actor, { role: target.role, userId: target.userId }, input.role)) {
      throw new PermissionError("members:change-role");
    }
    const clerk = await clerkClient();
    await clerk.organizations.updateOrganizationMembership({
      organizationId: workspace.clerkOrgId,
      userId: target.user.clerkId,
      role: clerkRoleFor(input.role),
    });
    await db.membership.update({ where: { id: target.id }, data: { role: input.role } });
  } catch (error) {
    return failure(error, "Could not change the role.");
  }
  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, message: "Role updated" };
}

export async function removeMember(slug: string, membershipId: string): Promise<ActionState> {
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  try {
    const target = await db.membership.findUnique({
      where: { id: z.string().min(1).parse(membershipId) },
      include: { user: true },
    });
    if (!target) return { ok: false, error: "Member not found." };
    if (!canRemoveMember({ role: membership.role, userId: user.id }, { role: target.role, userId: target.userId })) {
      throw new PermissionError("members:remove");
    }
    const clerk = await clerkClient();
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: workspace.clerkOrgId,
      userId: target.user.clerkId,
    });
    await db.membership.delete({ where: { id: target.id } });
  } catch (error) {
    return failure(error, "Could not remove the member.");
  }
  revalidatePath(`/w/${slug}/settings/members`);
  return { ok: true, message: "Member removed" };
}
