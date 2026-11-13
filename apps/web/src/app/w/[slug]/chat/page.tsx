import { Avatar, Badge, Card, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { Hash, MessageCircle, PenSquare } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon, NotYet } from "@/components/coming-soon";
import { PagePane, Panes, PrimaryAction } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Chat" };

// Placeholder rows so the layout can be judged; real channels arrive in phase 2.
const SAMPLE_CHANNELS = ["general", "announcements", "random"];

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, db } = await requireWorkspace(slug);
  const people = await db.membership.findMany({
    where: { userId: { not: user.id } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return (
    <Panes
      list={
        <PagePane
          title="Chat"
          subtitle={workspace.name}
          actions={
            <PrimaryAction label="New message" icon={<PenSquare />} sheetTitle="New message">
              <NotYet what="Messaging" phase={2} />
            </PrimaryAction>
          }
        >
          <section>
            <SectionLabel>Channels</SectionLabel>
            <Card>
              <RowList>
                {SAMPLE_CHANNELS.map((name) => (
                  <li key={name}>
                    <ListRow
                      leading={
                        <span className="flex size-10 items-center justify-center rounded-[30%] bg-muted text-muted-foreground">
                          <Hash className="size-5" />
                        </span>
                      }
                      title={name}
                      subtitle="No messages yet"
                      trailing={<Badge variant="outline">Sample</Badge>}
                    />
                  </li>
                ))}
              </RowList>
            </Card>
          </section>

          <section>
            <SectionLabel>Direct messages</SectionLabel>
            <Card>
              {people.length ? (
                <RowList>
                  {people.map(({ id, user: person }) => (
                    <li key={id}>
                      <ListRow
                        leading={<Avatar name={person.name} src={person.imageUrl} presence={person.presence} />}
                        title={person.name}
                        subtitle={person.statusText ?? person.email}
                      />
                    </li>
                  ))}
                </RowList>
              ) : (
                <p className="p-5 text-[15px] text-muted-foreground">
                  It&apos;s just you so far. Invite teammates from Settings → Members.
                </p>
              )}
            </Card>
          </section>
        </PagePane>
      }
      detail={
        <ComingSoon
          icon={<MessageCircle />}
          title="Conversations live here"
          description="Channels, direct messages, threads, reactions and file sharing open in this pane."
          phase={2}
        />
      }
    />
  );
}
