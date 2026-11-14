"use client";

import { Badge, Card, EmptyState, ListRow, RowList, SectionLabel, buttonVariants } from "@orbit/ui";
import type { MeetingDTO } from "@orbit/db/meeting-types";
import { CalendarDays, CalendarPlus, CalendarRange, ChevronRight, Lock, Video } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { localDayKey, LocalTime } from "@/components/local-time";
import { PagePane, PrimaryAction } from "@/components/shell/panes";
import { ScheduleForm } from "./schedule-form";

const noop = () => () => {};

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (localDayKey(date) === localDayKey(today)) return "Today";
  if (localDayKey(date) === localDayKey(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

export function MeetingsList({ slug, meetings, canSchedule }: { slug: string; meetings: MeetingDTO[]; canSchedule: boolean }) {
  const active = useSelectedLayoutSegment();
  // Grouping by day needs the viewer's time zone, which only the browser knows.
  const ready = useSyncExternalStore(noop, () => true, () => false);

  const groups = useMemo(() => {
    if (!ready) return [];
    const byDay = new Map<string, MeetingDTO[]>();
    for (const m of meetings) {
      const key = localDayKey(new Date(m.startsAt));
      byDay.set(key, [...(byDay.get(key) ?? []), m]);
    }
    return [...byDay].sort(([a], [b]) => a.localeCompare(b));
  }, [meetings, ready]);

  return (
    <PagePane
      title="Meetings"
      subtitle="Upcoming"
      actions={
        <>
          <Link href={`/w/${slug}/meetings/calendar`} aria-label="Calendar" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <CalendarRange />
          </Link>
          {canSchedule ? (
            <PrimaryAction label="Schedule" icon={<CalendarPlus />} sheetTitle="Schedule a meeting" sheetDescription="Invite teammates and share a join link.">
              {(close) => <ScheduleForm slug={slug} onDone={close} />}
            </PrimaryAction>
          ) : null}
        </>
      }
    >
      {meetings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays />}
            title="Nothing scheduled"
            description={canSchedule ? "Use Schedule to set up a meeting and invite people." : "Meetings you are invited to will appear here."}
          />
        </Card>
      ) : null}

      {groups.map(([key, items]) => (
        <section key={key}>
          <SectionLabel>{dayLabel(key)}</SectionLabel>
          <Card>
            <RowList>
              {items.map((m) => (
                <li key={m.id}>
                  <Link href={`/w/${slug}/meetings/${m.id}`} aria-current={active === m.id ? "page" : undefined} className="pressable block hover:bg-muted">
                    <ListRow
                      leading={
                        <span className="flex size-10 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
                          <Video className="size-5" />
                        </span>
                      }
                      title={m.title}
                      subtitle={<LocalTime iso={m.startsAt} endIso={m.endsAt} format="range" />}
                      trailing={
                        <>
                          {m.lobbyEnabled ? <Lock className="size-4" aria-label="Lobby on" /> : null}
                          <Badge>{m.invitees.length + 1}</Badge>
                          <ChevronRight className="size-5" />
                        </>
                      }
                    />
                  </Link>
                </li>
              ))}
            </RowList>
          </Card>
        </section>
      ))}
    </PagePane>
  );
}
