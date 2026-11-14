"use client";

import { Avatar, Badge, Button, Card, EmptyState, FieldError, ListRow, RowList, SectionLabel, buttonVariants } from "@orbit/ui";
import { channelTitle, type CallDTO, type ChannelDTO } from "@orbit/db/chat-types";
import { Hash, Lock, Phone, PhoneCall, Settings2, Users, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PeoplePicker, usePick } from "@/components/chat/new-chat";
import { useRealtime } from "@/components/chat/realtime-provider";
import { LocalTime } from "@/components/local-time";
import { PagePane, Panes, PrimaryAction } from "@/components/shell/panes";
import { StartCall } from "./start-call";

export type OngoingCall = { kind: "channel" | "meeting"; id: string; title: string | null; people: number };

type Props = { calls: CallDTO[]; ongoing: OngoingCall[]; configured: boolean; canStartNew: boolean };

export function CallsView({ calls, ongoing, configured, canStartNew }: Props) {
  const { slug, me, socket, channels, people, online } = useRealtime();
  const router = useRouter();

  // Keep "happening now" current: when someone starts a call, and on a slow timer for calls that end.
  useEffect(() => {
    const refresh = () => router.refresh();
    const timer = setInterval(refresh, 30_000);
    socket?.on("call:started", refresh);
    return () => {
      clearInterval(timer);
      socket?.off("call:started", refresh);
    };
  }, [socket, router]);

  const channelOf = (id: string) => channels.find((c) => c.id === id);
  const label = (channel: ChannelDTO | undefined) => (!channel ? "Conversation" : channel.kind === "CHANNEL" ? `#${channel.name}` : channelTitle(channel, me));

  const glyph = (channel: ChannelDTO | undefined): ReactNode => {
    if (channel?.kind === "DM") {
      const other = channel.members.find((m) => m.userId !== me);
      const person = other ? people.find((p) => p.userId === other.userId) : undefined;
      return <Avatar name={label(channel)} src={person?.imageUrl} presence={other && online.has(other.userId) ? "ONLINE" : "OFFLINE"} />;
    }
    const Icon = !channel ? Phone : channel.kind === "GROUP" ? Users : channel.isPrivate ? Lock : Hash;
    return (
      <span className="flex size-10 items-center justify-center rounded-[30%] bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
    );
  };

  const list = (
    <PagePane
      title="Calls"
      subtitle={ongoing.length ? `${ongoing.length} happening now` : "Recent and ongoing"}
      actions={
        canStartNew ? (
          <PrimaryAction label="New call" icon={<PhoneCall />} sheetTitle="Start a call" sheetDescription="Pick one person, or several for a group call.">
            {(close) => <NewCall onDone={close} />}
          </PrimaryAction>
        ) : null
      }
    >
      {!configured ? <SetupNotice /> : null}

      {ongoing.length ? (
        <section>
          <SectionLabel>Happening now</SectionLabel>
          <Card>
            <RowList>
              {ongoing.map((room) => {
                const channel = room.kind === "channel" ? channelOf(room.id) : undefined;
                return (
                  <li key={`${room.kind}-${room.id}`}>
                    <ListRow
                      leading={
                        room.kind === "meeting" ? (
                          <span className="flex size-10 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
                            <Video className="size-5" />
                          </span>
                        ) : (
                          glyph(channel)
                        )
                      }
                      title={room.kind === "meeting" ? (room.title ?? "Meeting") : label(channel)}
                      subtitle={`${room.people} ${room.people === 1 ? "person" : "people"} in the call`}
                      trailing={
                        <Link href={`/room/${slug}/${room.kind}/${room.id}`} className={buttonVariants({ size: "sm" })}>
                          Join
                        </Link>
                      }
                    />
                  </li>
                );
              })}
            </RowList>
          </Card>
        </section>
      ) : null}

      <section>
        <SectionLabel>Recent</SectionLabel>
        <Card>
          {calls.length ? (
            <RowList>
              {calls.map((call) => {
                const channel = channelOf(call.channelId);
                return (
                  <li key={call.id}>
                    <ListRow
                      leading={glyph(channel)}
                      title={label(channel)}
                      subtitle={
                        <>
                          {call.startedBy.id === me ? "You started a call" : `${call.startedBy.name} started a call`} · <LocalTime iso={call.startedAt} format="short" />
                        </>
                      }
                      trailing={<StartCall channelId={call.channelId} label={`Call ${label(channel)}`} variant="ghost" />}
                    />
                  </li>
                );
              })}
            </RowList>
          ) : (
            <EmptyState icon={<Phone />} title="No calls yet" description="Calls you start or are part of will be listed here." />
          )}
        </Card>
      </section>
    </PagePane>
  );

  // Desktop detail pane: every conversation, one tap away from a call.
  const detail = (
    <PagePane title="Start a call" subtitle="Call anyone you already talk to">
      <Card className="md:shadow-none md:ring-1 md:ring-border">
        {channels.length ? (
          <RowList>
            {channels.map((channel) => (
              <li key={channel.id}>
                <ListRow
                  leading={glyph(channel)}
                  title={label(channel)}
                  subtitle={channel.kind === "DM" ? undefined : `${channel.members.length} ${channel.members.length === 1 ? "member" : "members"}`}
                  trailing={
                    <>
                      {ongoing.some((room) => room.kind === "channel" && room.id === channel.id) ? <Badge variant="solid">Live</Badge> : null}
                      <StartCall channelId={channel.id} label={`Call ${label(channel)}`} />
                    </>
                  }
                />
              </li>
            ))}
          </RowList>
        ) : (
          <EmptyState icon={<Video />} title="No conversations yet" description="Start a chat first, then you can call it from here." />
        )}
      </Card>
    </PagePane>
  );

  return <Panes list={list} detail={detail} />;
}

/** Body of the "new call" sheet: opens (or reuses) the conversation with these people and starts a call in it. */
function NewCall({ onDone }: { onDone: () => void }) {
  const { request, slug } = useRealtime();
  const router = useRouter();
  const { picked, toggle } = usePick();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const channel = await request<ChannelDTO>("dm:open", { userIds: picked });
      await request("call:start", { channelId: channel.id });
      onDone();
      router.push(`/room/${slug}/channel/${channel.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PeoplePicker picked={picked} toggle={toggle} empty="No one else is in this workspace yet. Invite people from Settings → Members." />
      <FieldError>{error}</FieldError>
      <Button size="lg" disabled={busy || picked.length === 0} onClick={() => void start()}>
        <Video /> {picked.length > 1 ? "Start group call" : "Start call"}
      </Button>
    </div>
  );
}

function SetupNotice() {
  return (
    <Card className="flex items-start gap-3 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
        <Settings2 className="size-5" />
      </span>
      <div className="min-w-0 text-[15px]">
        <p className="font-semibold">Calls are not connected yet</p>
        <p className="text-muted-foreground">
          Audio and video run on LiveKit. Add <code className="rounded bg-muted px-1 py-0.5 text-sm">LIVEKIT_URL</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">LIVEKIT_API_KEY</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">LIVEKIT_API_SECRET</code> to <code className="rounded bg-muted px-1 py-0.5 text-sm">.env</code> and restart.
        </p>
      </div>
    </Card>
  );
}
