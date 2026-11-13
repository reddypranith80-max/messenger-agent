import { Avatar, Badge, Card, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { ROLE_LABEL, can, canChangeRole, canRemoveMember, invitableRoles, roleRank, type RoleName } from "@orbit/db";
import { Mail, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteForm } from "@/components/forms/invite-form";
import { ManageMember, RevokeInvitationButton } from "@/components/forms/manage-member";
import { BackLink, PagePane, PrimaryAction } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Members" };

const ASSIGNABLE: RoleName[] = ["ADMIN", "MEMBER", "GUEST"];

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, membership, db } = await requireWorkspace(slug);
  if (!can(membership.role, "members:view")) notFound();

  const actor = { role: membership.role, userId: user.id };
  const [members, invitations] = await Promise.all([
    db.membership.findMany({ include: { user: true }, orderBy: { createdAt: "asc" } }),
    can(membership.role, "invitations:view")
      ? db.invitation.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } })
      : [],
  ]);
  members.sort((a, b) => roleRank(b.role) - roleRank(a.role));
  const inviteRoles = invitableRoles(membership.role);

  return (
    <PagePane
      title="Members"
      subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`}
      leading={<BackLink href={`/w/${slug}/settings`} label="Back to settings" />}
      actions={
        inviteRoles.length ? (
          <PrimaryAction
            label="Invite"
            icon={<UserPlus />}
            sheetTitle="Invite by email"
            sheetDescription="They get an email with a link to join this workspace."
          >
            <InviteForm slug={slug} roles={inviteRoles} />
          </PrimaryAction>
        ) : null
      }
    >
      <Card className="md:shadow-none md:ring-1 md:ring-border">
        <RowList>
          {members.map((m) => {
            const target = { role: m.role, userId: m.userId };
            const roles = ASSIGNABLE.filter((r) => r !== m.role && canChangeRole(actor, target, r));
            const removable = canRemoveMember(actor, target);
            return (
              <li key={m.id}>
                <ListRow
                  leading={<Avatar name={m.user.name} src={m.user.imageUrl} presence={m.user.presence} />}
                  title={
                    <>
                      {m.user.name}
                      {m.userId === user.id ? <span className="text-muted-foreground"> (you)</span> : null}
                    </>
                  }
                  subtitle={m.user.email}
                  trailing={
                    <>
                      <Badge variant={m.role === "OWNER" || m.role === "ADMIN" ? "accent" : "neutral"}>
                        {ROLE_LABEL[m.role]}
                      </Badge>
                      {roles.length || removable ? (
                        <ManageMember
                          slug={slug}
                          membershipId={m.id}
                          name={m.user.name}
                          role={m.role}
                          roles={roles}
                          removable={removable}
                        />
                      ) : null}
                    </>
                  }
                />
              </li>
            );
          })}
        </RowList>
      </Card>

      {invitations.length ? (
        <section>
          <SectionLabel>Pending invitations</SectionLabel>
          <Card className="md:shadow-none md:ring-1 md:ring-border">
            <RowList>
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <ListRow
                    leading={
                      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Mail className="size-5" />
                      </span>
                    }
                    title={invitation.email}
                    subtitle={`Invited as ${ROLE_LABEL[invitation.role]}`}
                    trailing={
                      can(membership.role, "invitations:revoke") ? (
                        <RevokeInvitationButton slug={slug} invitationId={invitation.id} email={invitation.email} />
                      ) : null
                    }
                  />
                </li>
              ))}
            </RowList>
          </Card>
        </section>
      ) : null}
    </PagePane>
  );
}
