import { ChatError, channelTitle, getChannelForUser, isAtLeast, joinDecision } from "@orbit/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallRoom } from "@/components/calls/call-room";
import { requireWorkspace } from "@/server/context";
import { livekitConfig } from "@/server/livekit";

export const metadata: Metadata = { title: "Call" };
export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ slug: string; kind: string; id: string }> }) {
  const { slug, kind, id } = await params;
  if (kind !== "channel" && kind !== "meeting") notFound();
  const { user, membership, db } = await requireWorkspace(slug);
  const actor = { userId: user.id, role: membership.role };

  let title: string;
  let isHost = false;
  let canAdmit = false;
  if (kind === "channel") {
    const channel = await getChannelForUser(db, id, user.id).catch((error) => {
      if (error instanceof ChatError) notFound();
      throw error;
    });
    title = channelTitle(channel, user.id);
  } else {
    const { meeting, decision } = await joinDecision(db, actor, id);
    if (!meeting || decision === "forbidden") notFound();
    title = meeting.title;
    isHost = decision === "host";
    canAdmit = isHost || isAtLeast(membership.role, "ADMIN");
  }

  return (
    <CallRoom
      slug={slug}
      kind={kind}
      id={id}
      title={title}
      userName={user.name}
      configured={livekitConfig() !== null}
      isHost={isHost}
      canAdmit={canAdmit}
      backHref={kind === "meeting" ? `/w/${slug}/meetings/${id}` : `/w/${slug}/chat/${id}`}
    />
  );
}
