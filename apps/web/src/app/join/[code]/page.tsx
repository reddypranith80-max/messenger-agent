import { auth } from "@clerk/nextjs/server";
import { prisma, tenantDb } from "@orbit/db";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { syncMembershipsForUser } from "@/server/sync";

export const dynamic = "force-dynamic";

/**
 * /join/<code>: the link in invitations. Signing in is required (the proxy
 * sends visitors to sign-in and back), and only members of the meeting's
 * workspace get through; everyone else sees a plain 404.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { userId } = await auth();
  if (!userId) return notFound(); // unreachable behind the proxy; kept as a safeguard
  const user = await requireUser();

  // Resolving a link to its workspace is the one place an unscoped query is correct: the
  // code is global. Membership is then verified through the scoped client below.
  const meeting = await prisma.meeting.findUnique({
    where: { code: code.slice(0, 64) },
    select: { id: true, cancelledAt: true, workspaceId: true, workspace: { select: { slug: true } } },
  });
  if (!meeting || meeting.cancelledAt) notFound();

  const isMember = async () => Boolean(await tenantDb(meeting.workspaceId).membership.findFirst({ where: { userId: user.id } }));
  if (!(await isMember())) {
    await syncMembershipsForUser(user); // they may have just accepted a workspace invitation
    if (!(await isMember())) notFound();
  }
  redirect(`/room/${meeting.workspace.slug}/meeting/${meeting.id}`);
}
