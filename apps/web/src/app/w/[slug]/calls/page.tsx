import { isAtLeast, listChannelsForUser, listMeetings, listRecentCalls } from "@orbit/db";
import type { Metadata } from "next";
import { CallsView, type OngoingCall } from "@/components/calls/calls-view";
import { requireWorkspace } from "@/server/context";
import { activeRooms, livekitConfig, roomName } from "@/server/livekit";
import { daysFromNow } from "@/server/time";

export const metadata: Metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

export default async function CallsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  const config = livekitConfig();

  const [calls, channels, meetings, rooms] = await Promise.all([
    listRecentCalls(db, user.id),
    listChannelsForUser(db, user.id),
    listMeetings(db, user.id, { from: daysFromNow(-1), to: daysFromNow(1) }),
    config ? activeRooms(config, workspace.id) : Promise.resolve<Record<string, number>>({}),
  ]);

  // Only rooms this user may enter are shown: their conversations and their meetings.
  const ongoing: OngoingCall[] = [
    ...channels.map((c) => ({ kind: "channel" as const, id: c.id, title: null, people: rooms[roomName(workspace.id, "channel", c.id)] ?? 0 })),
    ...meetings.map((m) => ({ kind: "meeting" as const, id: m.id, title: m.title, people: rooms[roomName(workspace.id, "meeting", m.id)] ?? 0 })),
  ].filter((room) => room.people > 0);

  return <CallsView calls={calls} ongoing={ongoing} configured={config !== null} canStartNew={isAtLeast(membership.role, "MEMBER")} />;
}
