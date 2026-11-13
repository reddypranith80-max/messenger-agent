import { Card, EmptyState } from "@orbit/ui";
import { CalendarDays, CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon, NotYet } from "@/components/coming-soon";
import { PagePane, Panes, PrimaryAction } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireWorkspace(slug);
  const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <Panes
      list={
        <PagePane
          title="Meetings"
          subtitle={today}
          actions={
            <PrimaryAction label="Schedule" icon={<CalendarPlus />} sheetTitle="Schedule a meeting">
              <NotYet what="Scheduling" phase={4} />
            </PrimaryAction>
          }
        >
          <Card>
            <EmptyState
              icon={<CalendarDays />}
              title="Nothing scheduled"
              description="Upcoming meetings will appear here with a join button."
            />
          </Card>
        </PagePane>
      }
      detail={
        <ComingSoon
          icon={<CalendarDays />}
          title="Calendar"
          description="Schedule meetings, invite people by email, and join from a link with a lobby."
          phase={4}
        />
      }
    />
  );
}
