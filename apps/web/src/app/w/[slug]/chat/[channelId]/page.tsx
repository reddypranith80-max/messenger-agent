import { ChatError, getChannelForUser, getJoinableChannel, isAtLeast, listMessages } from "@orbit/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelView } from "@/components/chat/channel-view";
import { JoinChannel } from "@/components/chat/join-channel";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: { params: Promise<{ slug: string; channelId: string }> }) {
  const { slug, channelId } = await params;
  const { user, membership, db } = await requireWorkspace(slug);

  try {
    await getChannelForUser(db, channelId, user.id);
  } catch (error) {
    if (!(error instanceof ChatError)) throw error;
    // Not a member: a public channel can be joined, anything else does not exist as far as this user knows.
    const joinable = await getJoinableChannel(db, channelId, membership.role);
    if (!joinable?.name) notFound();
    return <JoinChannel channelId={joinable.id} name={joinable.name} topic={joinable.topic} />;
  }

  const { messages, hasMore } = await listMessages(db, user.id, channelId);
  return (
    <ChannelView
      key={channelId}
      slug={slug}
      channelId={channelId}
      initialMessages={messages}
      initialHasMore={hasMore}
      canModerate={isAtLeast(membership.role, "ADMIN")}
    />
  );
}
