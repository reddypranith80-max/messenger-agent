"use client";

import { Avatar, Badge, Card, ListRow, RowList, SectionLabel, cn } from "@orbit/ui";
import { channelTitle, type ChannelDTO } from "@orbit/db/chat-types";
import { Hash, Lock, PenSquare, Users } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { PagePane, PrimaryAction } from "@/components/shell/panes";
import { useMessageSearch } from "./message-search";
import { NewChat } from "./new-chat";
import { useRealtime } from "./realtime-provider";

export function ChatList({ workspaceName, canCreate }: { workspaceName: string; canCreate: boolean }) {
  const { slug, me, channels, people, online, status } = useRealtime();
  const active = useSelectedLayoutSegment();
  const search = useMessageSearch();

  const rooms = channels.filter((c) => c.kind === "CHANNEL").sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const dms = channels.filter((c) => c.kind !== "CHANNEL");

  return (
    <PagePane
      title="Chat"
      subtitle={status === "online" ? workspaceName : status === "connecting" ? "Connecting…" : "Offline. Reconnecting…"}
      actions={
        <PrimaryAction label="New" icon={<PenSquare />} sheetTitle="Start something new" sheetDescription="Message someone, create a channel, or join one.">
          {(close) => <NewChat onDone={close} canCreate={canCreate} />}
        </PrimaryAction>
      }
    >
      {search.box}
      {search.results}

      <section hidden={search.results !== null}>
        <SectionLabel>Channels</SectionLabel>
        <Card>
          {rooms.length ? (
            <RowList>
              {rooms.map((c) => (
                <li key={c.id}>
                  <Row channel={c} slug={slug} active={active === c.id} title={`${c.name}`} leading={<Glyph>{c.isPrivate ? <Lock className="size-5" /> : <Hash className="size-5" />}</Glyph>} subtitle={c.topic ?? `${c.members.length} ${c.members.length === 1 ? "member" : "members"}`} />
                </li>
              ))}
            </RowList>
          ) : (
            <p className="p-5 text-[15px] text-muted-foreground">No channels yet. Use “New” to create or join one.</p>
          )}
        </Card>
      </section>

      <section hidden={search.results !== null}>
        <SectionLabel>Direct messages</SectionLabel>
        <Card>
          {dms.length ? (
            <RowList>
              {dms.map((c) => {
                const other = c.kind === "DM" ? c.members.find((m) => m.userId !== me) : undefined;
                const person = other ? people.find((p) => p.userId === other.userId) : undefined;
                const title = channelTitle(c, me);
                return (
                  <li key={c.id}>
                    <Row
                      channel={c}
                      slug={slug}
                      active={active === c.id}
                      title={title}
                      leading={
                        c.kind === "GROUP" ? (
                          <Glyph round>
                            <Users className="size-5" />
                          </Glyph>
                        ) : (
                          <Avatar name={title} src={person?.imageUrl} presence={other && online.has(other.userId) ? "ONLINE" : "OFFLINE"} />
                        )
                      }
                      subtitle={c.kind === "GROUP" ? `${c.members.length} people` : undefined}
                    />
                  </li>
                );
              })}
            </RowList>
          ) : (
            <p className="p-5 text-[15px] text-muted-foreground">
              {people.length ? "No conversations yet. Use “New” to message someone." : "It’s just you so far. Invite teammates from Settings → Members."}
            </p>
          )}
        </Card>
      </section>
    </PagePane>
  );
}

function Glyph({ children, round }: { children: React.ReactNode; round?: boolean }) {
  return <span className={cn("flex size-10 items-center justify-center bg-muted text-muted-foreground", round ? "rounded-full" : "rounded-[30%]")}>{children}</span>;
}

function Row({ channel, slug, active, title, leading, subtitle }: { channel: ChannelDTO; slug: string; active: boolean; title: string; leading: React.ReactNode; subtitle?: string }) {
  return (
    <Link href={`/w/${slug}/chat/${channel.id}`} aria-current={active ? "page" : undefined} className={cn("pressable block hover:bg-muted", active && "bg-secondary/60")}>
      <ListRow
        leading={leading}
        title={<span className={cn(channel.unread > 0 && "font-bold")}>{title}</span>}
        subtitle={subtitle}
        trailing={channel.unread > 0 ? <Badge variant="solid" aria-label={`${channel.unread} unread`}>{channel.unread > 99 ? "99+" : channel.unread}</Badge> : null}
      />
    </Link>
  );
}
