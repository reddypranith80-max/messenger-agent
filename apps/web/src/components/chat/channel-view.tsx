"use client";

import { Avatar, Button, Skeleton, cn } from "@orbit/ui";
import { channelTitle, type MessageDTO } from "@orbit/db/chat-types";
import { ArrowDown, ChevronLeft, Hash, Lock, Users } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StartCall } from "@/components/calls/start-call";
import { fetchMessages } from "@/server/chat-actions";
import { Composer } from "./composer";
import { DaySeparator, MessageActionsSheet, MessageItem, startsGroup, useLocalClock } from "./message-parts";
import { useRealtime } from "./realtime-provider";
import { ThreadSheet } from "./thread-sheet";
import { useLiveMessages } from "./use-live-messages";
import { useMessageOps } from "./use-message-ops";

type Props = {
  slug: string;
  channelId: string;
  initialMessages: MessageDTO[];
  initialHasMore: boolean;
  canModerate: boolean;
};

export function ChannelView({ slug, channelId, initialMessages, initialHasMore, canModerate }: Props) {
  const { me, channels, request, socket, status, online, setActiveChannel, people } = useRealtime();
  const channel = channels.find((c) => c.id === channelId);

  const { messages, setMessages, add } = useLiveMessages({
    channelId,
    parentId: null,
    initial: initialMessages,
    refetch: () => fetchMessages(slug, channelId).then((r) => r.messages),
  });
  const ops = useMessageOps(add);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionsFor, setActionsFor] = useState<MessageDTO | null>(null);
  const [threadFor, setThreadFor] = useState<MessageDTO | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [unseen, setUnseen] = useState(false);
  const localClock = useLocalClock();

  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const restore = useRef<number | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const members = useMemo(() => (channel?.members ?? []).filter((m) => m.userId !== me).map((m) => ({ userId: m.userId, name: m.name })), [channel, me]);
  const names = useMemo(() => (channel?.members ?? []).map((m) => m.name), [channel]);
  const meName = channel?.members.find((m) => m.userId === me)?.name ?? "";

  // ---- this conversation is on screen: its messages are read
  useEffect(() => {
    setActiveChannel(channelId);
    return () => setActiveChannel(null);
  }, [channelId, setActiveChannel]);

  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (!socket) return;
    const markRead = () => {
      if (document.visibilityState === "visible") request("channel:read", { channelId }).catch(() => {});
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    window.addEventListener("focus", markRead);
    return () => {
      document.removeEventListener("visibilitychange", markRead);
      window.removeEventListener("focus", markRead);
    };
  }, [socket, request, channelId, lastId, status]);

  // ---- typing indicators
  useEffect(() => {
    if (!socket) return;
    const timers = typingTimers.current;
    const onTyping = (p: { channelId: string; userId: string; name: string; on: boolean }) => {
      if (p.channelId !== channelId) return;
      clearTimeout(timers.get(p.userId));
      const drop = () =>
        setTyping((cur) => {
          const next = { ...cur };
          delete next[p.userId];
          return next;
        });
      if (!p.on) return drop();
      setTyping((cur) => ({ ...cur, [p.userId]: p.name }));
      timers.set(p.userId, setTimeout(drop, 5000));
    };
    // Someone who just sent a message is no longer typing; and a message that
    // arrives while we are scrolled up becomes a "New messages" prompt.
    const onNew = (m: MessageDTO) => {
      if (m.channelId !== channelId) return;
      clearTimeout(timers.get(m.authorId));
      setTyping((cur) => {
        if (!(m.authorId in cur)) return cur;
        const next = { ...cur };
        delete next[m.authorId];
        return next;
      });
      if (!m.parentId && m.authorId !== me && !stuck.current) setUnseen(true);
    };
    socket.on("typing", onTyping);
    socket.on("message:new", onNew);
    return () => {
      socket.off("typing", onTyping);
      socket.off("message:new", onNew);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [socket, channelId, me]);

  // ---- scrolling
  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    stuck.current = true;
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current !== null) {
      el.scrollTop += el.scrollHeight - restore.current;
      restore.current = null;
      return;
    }
    if (stuck.current || messages.at(-1)?.authorId === me) toBottom();
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps -- only react to a new last message

  useLayoutEffect(() => toBottom(), [toBottom]);

  const loadEarlier = async () => {
    const oldest = messages[0];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(slug, channelId, oldest.createdAt);
      restore.current = scroller.current?.scrollHeight ?? null;
      setMessages((list) => [...page.messages, ...list]);
      setHasMore(page.hasMore);
    } catch (e) {
      ops.fail(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // ---- derived display
  const lastMine = [...messages].reverse().find((m) => m.authorId === me && !m.deleted);
  const seenLabel = (m: MessageDTO): string | null => {
    if (!channel || m.id !== lastMine?.id) return null;
    const seen = channel.members.filter((x) => x.userId !== me && x.lastReadAt >= m.createdAt).length;
    if (!seen) return null;
    return channel.kind === "DM" ? "Seen" : `Seen by ${seen}`;
  };

  if (!channel) {
    return (
      <div className="flex h-full flex-col gap-3 p-6" role="status" aria-label="Loading conversation">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const title = channelTitle(channel, me);
  const other = channel.kind === "DM" ? channel.members.find((m) => m.userId !== me) : undefined;
  const otherPerson = other ? people.find((p) => p.userId === other.userId) : undefined;
  const typers = Object.values(typing);
  const typingText = typers.length === 0 ? "" : typers.length === 1 ? `${typers[0]} is typing…` : typers.length === 2 ? `${typers[0]} and ${typers[1]} are typing…` : "Several people are typing…";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5">
        <Link href={`/w/${slug}/chat`} aria-label="Back to conversations" className="pressable flex size-9 items-center justify-center rounded-full hover:bg-muted md:hidden">
          <ChevronLeft />
        </Link>
        {channel.kind === "CHANNEL" ? (
          <span className="flex size-10 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
            {channel.isPrivate ? <Lock className="size-5" /> : <Hash className="size-5" />}
          </span>
        ) : channel.kind === "DM" ? (
          <Avatar name={title} src={otherPerson?.imageUrl} presence={other && online.has(other.userId) ? "ONLINE" : "OFFLINE"} />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Users className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold tracking-tight">{title}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {channel.kind === "CHANNEL" ? (channel.topic ?? `${channel.members.length} ${channel.members.length === 1 ? "member" : "members"}`) : channel.kind === "GROUP" ? `${channel.members.length} people` : other && online.has(other.userId) ? "Online" : "Offline"}
          </p>
        </div>
        <StartCall channelId={channelId} label="Start a call" />
      </header>

      {status !== "online" ? (
        <p role="status" className="bg-warning/20 px-4 py-1.5 text-center text-sm font-medium">
          {status === "connecting" ? "Connecting…" : "You are offline. Reconnecting…"}
        </p>
      ) : null}
      {ops.notice ? (
        <p role="alert" className="bg-destructive/10 px-4 py-1.5 text-center text-sm text-destructive">
          {ops.notice}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
            if (stuck.current) setUnseen(false);
          }}
          role="log"
          aria-live="polite"
          aria-label={`Messages in ${title}`}
          className="scrollbar-soft h-full overflow-y-auto overscroll-contain py-2"
        >
          {hasMore ? (
            <div className="flex justify-center py-2">
              <Button variant="secondary" size="sm" onClick={() => void loadEarlier()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load earlier messages"}
              </Button>
            </div>
          ) : (
            <div className="px-5 pt-6 pb-2">
              <p className="text-xl font-bold tracking-tight">{channel.kind === "CHANNEL" ? `Welcome to #${channel.name}` : `This is the start of your conversation`}</p>
              <p className="text-[15px] text-muted-foreground">
                {channel.kind === "CHANNEL" ? (channel.topic ?? "Say hello and get the conversation going.") : "Messages here are only visible to the people in it."}
              </p>
            </div>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            // Day boundaries depend on the viewer's time zone, so they appear once the browser has taken over.
            const newDay = localClock && (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString());
            return (
              <Fragment key={m.id}>
                {newDay ? <DaySeparator iso={m.createdAt} /> : null}
                <MessageItem
                  message={m}
                  me={me}
                  names={names}
                  meName={meName}
                  showHeader={newDay || !prev || startsGroup(prev, m)}
                  seen={seenLabel(m)}
                  editing={editingId === m.id}
                  onActions={setActionsFor}
                  onReact={ops.react}
                  onOpenThread={setThreadFor}
                  onEditSubmit={async (body) => {
                    await ops.edit(m, body);
                    setEditingId(null);
                  }}
                  onEditCancel={() => setEditingId(null)}
                />
              </Fragment>
            );
          })}
          {messages.length === 0 ? <p className="px-5 py-4 text-[15px] text-muted-foreground">No messages yet. Write the first one below.</p> : null}
        </div>

        {unseen ? (
          <Button
            size="sm"
            onClick={() => {
              toBottom(true);
              setUnseen(false);
            }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-float">
            <ArrowDown /> New messages
          </Button>
        ) : null}
      </div>

      <div className={cn("h-6 px-5 text-sm text-muted-foreground", !typingText && "invisible")} aria-live="polite">
        {typingText || " "}
      </div>
      <Composer
        placeholder={`Message ${channel.kind === "CHANNEL" ? `#${channel.name}` : title}`}
        members={members}
        onTyping={(on) => socket?.emit("typing", { channelId, on })}
        onSend={async (body) => {
          const message = await request<MessageDTO>("message:send", { channelId, body });
          add(message);
        }}
      />

      <MessageActionsSheet
        message={actionsFor}
        me={me}
        isMine={actionsFor?.authorId === me}
        canModerate={canModerate}
        onClose={() => setActionsFor(null)}
        onReact={ops.react}
        onReply={(m) => {
          setActionsFor(null);
          setThreadFor(m);
        }}
        onEdit={(m) => {
          setEditingId(m.id);
          setActionsFor(null);
        }}
        onDelete={(m) => {
          setActionsFor(null);
          ops.remove(m);
        }}
      />
      <ThreadSheet
        root={threadFor}
        onClose={() => setThreadFor(null)}
        slug={slug}
        channelId={channelId}
        members={members}
        names={names}
        meName={meName}
        canModerate={canModerate}
      />
    </div>
  );
}
