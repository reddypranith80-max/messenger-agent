import { SignOutButton } from "@clerk/nextjs";
import { Avatar, Badge, Button, Card, ListRow, PRESENCE_LABEL, RowList, SectionLabel } from "@orbit/ui";
import { ROLE_LABEL, can } from "@orbit/db";
import { Building2, ChevronRight, LogOut, Palette, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PagePane, SegmentPanes } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

type Props = { params: Promise<{ slug: string }>; children: ReactNode };

export default async function SettingsLayout({ params, children }: Props) {
  const { slug } = await params;
  const { user, workspace, membership } = await requireWorkspace(slug);
  const base = `/w/${slug}/settings`;

  const sections = [
    { href: `${base}/profile`, icon: UserRound, title: "Profile", subtitle: PRESENCE_LABEL[user.presence], show: true },
    { href: `${base}/appearance`, icon: Palette, title: "Appearance", subtitle: "Theme", show: true },
    { href: `${base}/workspace`, icon: Building2, title: "Workspace", subtitle: workspace.name, show: true },
    {
      href: `${base}/members`,
      icon: UsersRound,
      title: "Members",
      subtitle: "People and invitations",
      show: can(membership.role, "members:view"),
    },
  ].filter((s) => s.show);

  return (
    <SegmentPanes
      list={
        <PagePane title="Settings">
          <Card>
            <ListRow
              className="py-4"
              leading={<Avatar name={user.name} src={user.imageUrl} size="lg" presence={user.presence} />}
              title={<span className="text-[17px] font-semibold">{user.name}</span>}
              subtitle={user.email}
              trailing={<Badge variant="accent">{ROLE_LABEL[membership.role]}</Badge>}
            />
          </Card>

          <section>
            <SectionLabel>Preferences</SectionLabel>
            <Card>
              <RowList>
                {sections.map(({ href, icon: Icon, title, subtitle }) => (
                  <li key={href}>
                    <Link href={href} className="pressable block hover:bg-muted">
                      <ListRow
                        leading={
                          <span className="flex size-10 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
                            <Icon className="size-5" />
                          </span>
                        }
                        title={title}
                        subtitle={subtitle}
                        trailing={<ChevronRight className="size-5" />}
                      />
                    </Link>
                  </li>
                ))}
              </RowList>
            </Card>
          </section>

          <SignOutButton>
            <Button variant="outline" className="w-full text-destructive">
              <LogOut /> Sign out
            </Button>
          </SignOutButton>
        </PagePane>
      }
      detail={children}
    />
  );
}
