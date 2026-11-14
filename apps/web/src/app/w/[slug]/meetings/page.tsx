import { isAtLeast, listMeetings } from "@orbit/db";
import type { Metadata } from "next";
import { MeetingsCalendar } from "@/components/meetings/meetings-calendar";
import { requireWorkspace } from "@/server/context";
import { daysFromNow } from "@/server/time";

export const metadata: Metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

export default async function MeetingsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, membership, db } = await requireWorkspace(slug);
  // A window around today so the calendar can page a few months either way.
  const meetings = await listMeetings(db, user.id, {
    from: daysFromNow(-62),
    to: daysFromNow(366),
  });
  return <MeetingsCalendar slug={slug} meetings={meetings} canSchedule={isAtLeast(membership.role, "MEMBER")} />;
}
