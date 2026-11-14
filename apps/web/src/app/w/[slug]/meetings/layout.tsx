import { isAtLeast, listMeetings } from "@orbit/db";
import type { ReactNode } from "react";
import { MeetingsList } from "@/components/meetings/meetings-list";
import { SegmentPanes } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";
import { daysFromNow } from "@/server/time";

export const dynamic = "force-dynamic";

export default async function MeetingsLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  const { user, membership, db } = await requireWorkspace(slug);
  // Anything that has not finished, within the next 90 days.
  const meetings = await listMeetings(db, user.id, { from: daysFromNow(0), to: daysFromNow(90) });
  return <SegmentPanes list={<MeetingsList slug={slug} meetings={meetings} canSchedule={isAtLeast(membership.role, "MEMBER")} />} detail={children} />;
}
