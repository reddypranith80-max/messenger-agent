import { Avatar, Badge, Card, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { ROLE_LABEL, can } from "@orbit/db";
import type { Metadata } from "next";
import { LeaveOrDeleteWorkspace, RenameWorkspaceForm } from "@/components/forms/workspace-settings";
import { BackLink, PagePane } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Workspace" };

const PLAN_LABEL = { FREE: "Free", PRO: "Pro", BUSINESS: "Business" } as const;

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, membership, db } = await requireWorkspace(slug);
  const memberCount = await db.membership.count();
  const created = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(workspace.createdAt);

  const facts = [
    { label: "Address", value: `orbit/${workspace.slug}` },
    { label: "Plan", value: <Badge variant="accent">{PLAN_LABEL[workspace.plan]}</Badge> },
    { label: "Members", value: memberCount },
    { label: "Your role", value: ROLE_LABEL[membership.role] },
    { label: "Created", value: created },
  ];

  return (
    <PagePane title="Workspace" leading={<BackLink href={`/w/${slug}/settings`} label="Back to settings" />}>
      <Card className="md:shadow-none md:ring-1 md:ring-border">
        <ListRow
          className="py-4"
          leading={<Avatar name={workspace.name} src={workspace.imageUrl} shape="rounded" size="lg" />}
          title={<span className="text-[17px] font-semibold">{workspace.name}</span>}
          subtitle={`orbit/${workspace.slug}`}
        />
      </Card>

      <section>
        <SectionLabel>Details</SectionLabel>
        <Card className="md:shadow-none md:ring-1 md:ring-border">
          <RowList>
            {facts.map(({ label, value }) => (
              <li key={label} className="flex min-h-13 items-center justify-between gap-4 px-5 py-3 text-[15px]">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </li>
            ))}
          </RowList>
        </Card>
      </section>

      {can(membership.role, "workspace:update") ? (
        <section>
          <SectionLabel>Name</SectionLabel>
          <Card className="p-5 md:shadow-none md:ring-1 md:ring-border">
            <RenameWorkspaceForm slug={slug} name={workspace.name} />
          </Card>
        </section>
      ) : null}

      <section>
        <SectionLabel>{membership.role === "OWNER" ? "Danger zone" : "Membership"}</SectionLabel>
        <Card className="p-5 md:shadow-none md:ring-1 md:ring-border">
          <LeaveOrDeleteWorkspace slug={slug} name={workspace.name} isOwner={membership.role === "OWNER"} />
        </Card>
      </section>

      <p className="px-5 text-sm text-muted-foreground">Billing, usage limits and the audit log are not part of this build yet.</p>
    </PagePane>
  );
}
