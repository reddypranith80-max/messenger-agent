"use client";

import { Avatar, Card, EmptyState, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { channelTitle, type ActivityItem, type ChannelDTO } from "@orbit/db/chat-types";
import { AtSign, Bell, CalendarDays, MessageSquareReply } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";
import { LocalTime } from "@/components/local-time";
import { PagePane } from "@/components/shell/panes";
import { fetchActivity, markActivityRead } from "@/server/chat-actions";

function where(channel: ChannelDTO | undefined, me: string): string {
  if (!channel) return "a conversation";
  return channel.kind === "CHANNEL" ? `#${channel.name}` : channel.kind === "DM" ? "a direct message" : channelTitle(channel, me);
}

/** Mentions, replies and invitations, newest first. Opening the page marks them as seen. */
export function ActivityFeed({ initialItems, seenAt }: { initialItems: ActivityItem[]; seenAt: string }) {
  const { slug, me, socket, channels, clearActivity } = useRealtime();
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    clearActivity();
    markActivityRead(slug).catch(() => {});
  }, [slug, clearActivity]);

  // Something new arrived while the page is open: show it, and it counts as seen.
  useEffect(() => {
    if (!socket) return;
    const onNew = () => {
      fetchActivity(slug).then(setItems, () => {});
      clearActivity();
      markActivityRead(slug).catch(() => {});
    };
    socket.on("activity:new", onNew);
    return () => {
      socket.off("activity:new", onNew);
    };
  }, [socket, slug, clearActivity]);

  const fresh = items.filter((i) => i.at > seenAt);
  const earlier = items.filter((i) => i.at <= seenAt);

  const row = (item: ActivityItem) => {
    const channel = item.kind === "invite" ? undefined : channels.find((c) => c.id === item.channelId);
    const href = item.kind === "invite" ? `/w/${slug}/meetings/${item.meetingId}` : `/w/${slug}/chat/${item.channelId}`;
    const Icon = item.kind === "mention" ? AtSign : item.kind === "reply" ? MessageSquareReply : CalendarDays;
    const title =
      item.kind === "invite"
        ? `${item.actor.name} invited you to ${item.title}`
        : `${item.actor.name} ${item.kind === "mention" ? "mentioned you" : "replied to you"} in ${where(channel, me)}`;
    return (
      <li key={`${item.kind}-${item.id}`}>
        <Link href={href} className="pressable block hover:bg-muted">
          <ListRow
            leading={
              <span className="relative block">
                <Avatar name={item.actor.name} src={item.actor.imageUrl} />
                <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground ring-2 ring-card">
                  <Icon className="size-3" />
                </span>
              </span>
            }
            title={title}
            subtitle={item.kind === "invite" ? <LocalTime iso={item.startsAt} format="datetime" /> : item.text}
            trailing={<LocalTime iso={item.at} format="short" className="text-xs" />}
          />
        </Link>
      </li>
    );
  };

  return (
    <PagePane title="Activity" subtitle="Mentions, replies and invites">
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell />} title="You're all caught up" description="When someone mentions you, replies to you or invites you to a meeting, it shows up here." />
        </Card>
      ) : null}
      {fresh.length ? (
        <section>
          <SectionLabel>New</SectionLabel>
          <Card>
            <RowList>{fresh.map(row)}</RowList>
          </Card>
        </section>
      ) : null}
      {earlier.length ? (
        <section>
          <SectionLabel>{fresh.length ? "Earlier" : "Recent"}</SectionLabel>
          <Card>
            <RowList>{earlier.map(row)}</RowList>
          </Card>
        </section>
      ) : null}
    </PagePane>
  );
}
