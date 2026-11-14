import { Avatar, Badge, Card, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { ChatError, getMeeting, isAtLeast } from "@orbit/db";
import { Lock, LockOpen } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { MeetingActions } from "@/components/meetings/meeting-actions";
import { BackLink, PagePane } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { user, membership, db } = await requireWorkspace(slug);
  const meeting = await getMeeting(db, user.id, id).catch((error) => {
    if (error instanceof ChatError) notFound();
    throw error;
  });
  const isHost = meeting.host.userId === user.id;
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/join/${meeting.code}`;

  return (
    <PagePane title={meeting.title} subtitle={<LocalTime iso={meeting.startsAt} endIso={meeting.endsAt} format="range" />} leading={<BackLink href={`/w/${slug}/meetings`} label="Back to meetings" />}>
      <Card className="flex flex-col gap-4 p-5 md:shadow-none md:ring-1 md:ring-border">
        {meeting.description ? <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{meeting.description}</p> : null}
        <MeetingActions
          slug={slug}
          meetingId={meeting.id}
          link={link}
          startsAt={meeting.startsAt}
          endsAt={meeting.endsAt}
          isHost={isHost}
          canCancel={isHost || isAtLeast(membership.role, "ADMIN")}
        />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {meeting.lobbyEnabled ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          {meeting.lobbyEnabled ? "Lobby on: people who were not invited wait for the host." : "Lobby off: any workspace member can join."}
        </p>
      </Card>

      <section>
        <SectionLabel>People</SectionLabel>
        <Card className="md:shadow-none md:ring-1 md:ring-border">
          <RowList>
            <li>
              <ListRow leading={<Avatar name={meeting.host.name} src={meeting.host.imageUrl} />} title={meeting.host.name} trailing={<Badge variant="accent">Host</Badge>} />
            </li>
            {meeting.invitees.map((p) => (
              <li key={p.userId}>
                <ListRow leading={<Avatar name={p.name} src={p.imageUrl} />} title={p.name} trailing={<Badge>Invited</Badge>} />
              </li>
            ))}
          </RowList>
        </Card>
      </section>
    </PagePane>
  );
}
