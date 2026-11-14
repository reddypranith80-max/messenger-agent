"use client";

import { Button, Card, ListRow, RowList, Skeleton, cn } from "@orbit/ui";
import { useLocalClock } from "@/components/chat/message-parts";
import type { MeetingDTO } from "@orbit/db/meeting-types";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { localDayKey, LocalTime } from "@/components/local-time";
import { BackLink, PagePane, PrimaryAction } from "@/components/shell/panes";
import { ScheduleForm } from "./schedule-form";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month view. Days with meetings carry a dot; picking a day lists its meetings. */
export function MeetingsCalendar(props: { slug: string; meetings: MeetingDTO[]; canSchedule: boolean }) {
  // Which day is today, and which day a meeting falls on, depend on the viewer's time zone: draw the month in the browser.
  const ready = useLocalClock();
  if (!ready) {
    return (
      <PagePane title="Calendar" leading={<BackLink href={`/w/${props.slug}/meetings`} label="Back to meetings" />}>
        <Skeleton className="h-96 w-full rounded-card" />
      </PagePane>
    );
  }
  return <Month {...props} />;
}

function Month({ slug, meetings, canSchedule }: { slug: string; meetings: MeetingDTO[]; canSchedule: boolean }) {
  const [now] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(() => localDayKey(now));

  const byDay = useMemo(() => {
    const map = new Map<string, MeetingDTO[]>();
    for (const m of meetings) {
      const key = localDayKey(new Date(m.startsAt));
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [meetings]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // week starts on Monday
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))];
  }, [cursor]);

  const todayKey = localDayKey(now);
  const dayMeetings = byDay.get(selected) ?? [];
  const [sy, sm, sd] = selected.split("-").map(Number) as [number, number, number];
  const selectedDate = new Date(sy, sm - 1, sd);
  const move = (by: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + by, 1));

  return (
    <PagePane
      title="Calendar"
      leading={<BackLink href={`/w/${slug}/meetings`} label="Back to meetings" />}
      actions={
        canSchedule ? (
          <PrimaryAction label="Schedule" icon={<Plus />} sheetTitle="Schedule a meeting">
            {(close) => <ScheduleForm slug={slug} onDone={close} defaultDay={selectedDate} />}
          </PrimaryAction>
        ) : null
      }
    >
      <Card className="p-4 md:shadow-none md:ring-1 md:ring-border">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(cursor)}</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => move(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(todayKey); }}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => move(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} />;
            const key = localDayKey(date);
            const count = byDay.get(key)?.length ?? 0;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                aria-label={`${date.toDateString()}${count ? `, ${count} ${count === 1 ? "meeting" : "meetings"}` : ""}`}
                aria-pressed={isSelected}
                onClick={() => setSelected(key)}
                className={cn(
                  "pressable relative mx-auto flex size-10 flex-col items-center justify-center rounded-full text-[15px] font-medium",
                  isSelected ? "bg-primary text-primary-foreground" : key === todayKey ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
                )}
              >
                {date.getDate()}
                {count ? <span aria-hidden className={cn("absolute bottom-1 size-1 rounded-full", isSelected ? "bg-primary-foreground" : "bg-primary")} /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <section>
        <h2 className="px-5 pb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
          {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(selectedDate)}
        </h2>
        <Card className="md:shadow-none md:ring-1 md:ring-border">
          {dayMeetings.length ? (
            <RowList>
              {dayMeetings.map((m) => (
                <li key={m.id}>
                  <Link href={`/w/${slug}/meetings/${m.id}`} className="pressable block hover:bg-muted">
                    <ListRow title={m.title} subtitle={<LocalTime iso={m.startsAt} endIso={m.endsAt} format="range" />} trailing={<ChevronRight className="size-5" />} />
                  </Link>
                </li>
              ))}
            </RowList>
          ) : (
            <p className="p-5 text-[15px] text-muted-foreground">No meetings on this day.</p>
          )}
        </Card>
      </section>
    </PagePane>
  );
}
