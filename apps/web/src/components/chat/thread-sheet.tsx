"use client";

import { Sheet, Skeleton } from "@orbit/ui";
import type { MessageDTO } from "@orbit/db/chat-types";
import { useEffect, useState } from "react";
import { fetchThread } from "@/server/chat-actions";
import { Composer, type Mentionable } from "./composer";
import { MessageActionsSheet, MessageItem, startsGroup } from "./message-parts";
import { useRealtime } from "./realtime-provider";
import { useLiveMessages } from "./use-live-messages";
import { useMessageOps } from "./use-message-ops";

type Shared = {
  slug: string;
  channelId: string;
  members: Mentionable[];
  names: string[];
  meName: string;
  canModerate: boolean;
};

export function ThreadSheet({ root, onClose, ...shared }: Shared & { root: MessageDTO | null; onClose: () => void }) {
  // Keep showing the last thread while the sheet animates closed.
  const [kept, setKept] = useState(root);
  if (root && root !== kept) setKept(root);
  const shown = root ?? kept;
  return (
    <Sheet open={root !== null} onOpenChange={(open) => !open && onClose()} title="Thread" description={shown ? `Started by ${shown.author.name}` : undefined} className="md:max-w-xl">
      {shown ? <ThreadLoader key={shown.id} rootId={shown.id} {...shared} /> : null}
    </Sheet>
  );
}

function ThreadLoader({ rootId, ...shared }: Shared & { rootId: string }) {
  const [data, setData] = useState<{ root: MessageDTO; replies: MessageDTO[] } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    fetchThread(shared.slug, shared.channelId, rootId).then(
      (result) => live && setData(result),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load the thread."),
    );
    return () => {
      live = false;
    };
  }, [shared.slug, shared.channelId, rootId]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading thread">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
    );
  }
  return <ThreadBody data={data} {...shared} />;
}

function ThreadBody({ data, slug, channelId, members, names, meName, canModerate }: Shared & { data: { root: MessageDTO; replies: MessageDTO[] } }) {
  const { me, request } = useRealtime();
  const [rootMessage, setRootMessage] = useState(data.root);
  const { messages, add } = useLiveMessages({
    channelId,
    parentId: data.root.id,
    initial: data.replies,
    refetch: () => fetchThread(slug, channelId, data.root.id).then((t) => t.replies),
  });
  // An edit result belongs either to the root or to a reply; never mix them up.
  const ops = useMessageOps((m) => (m.id === data.root.id ? setRootMessage(m) : add(m)));
  const [actionsFor, setActionsFor] = useState<MessageDTO | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // The root message can be reacted to or edited from the timeline while the thread is open.
  const { socket } = useRealtime();
  useEffect(() => {
    if (!socket) return;
    const onUpdated = (m: MessageDTO) => m.id === data.root.id && setRootMessage(m);
    const onReaction = (p: { messageId: string; reactions: MessageDTO["reactions"] }) =>
      p.messageId === data.root.id && setRootMessage((m) => ({ ...m, reactions: p.reactions }));
    socket.on("message:updated", onUpdated);
    socket.on("reaction:updated", onReaction);
    return () => {
      socket.off("message:updated", onUpdated);
      socket.off("reaction:updated", onReaction);
    };
  }, [socket, data.root.id]);

  const all = [rootMessage, ...messages];
  const item = (m: MessageDTO, i: number) => (
    <MessageItem
      key={m.id}
      message={m}
      me={me}
      names={names}
      meName={meName}
      showHeader={i === 0 || startsGroup(all[i - 1], m)}
      editing={editingId === m.id}
      onActions={setActionsFor}
      onReact={ops.react}
      onEditSubmit={async (body) => {
        await ops.edit(m, body);
        setEditingId(null);
      }}
      onEditCancel={() => setEditingId(null)}
    />
  );

  return (
    <div className="-mx-6 flex flex-col">
      {ops.notice ? (
        <p role="alert" className="mx-6 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ops.notice}
        </p>
      ) : null}
      <div className="flex flex-col pb-2">
        {item(rootMessage, 0)}
        <div role="separator" className="mx-4 my-2 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
          {messages.length} {messages.length === 1 ? "reply" : "replies"}
          <span className="h-px flex-1 bg-border" />
        </div>
        {messages.map((m, i) => item(m, i + 1))}
      </div>
      <Composer
        placeholder="Reply in thread"
        members={members}
        onSend={async (body) => {
          const message = await request<MessageDTO>("message:send", { channelId, body, parentId: data.root.id });
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
        onEdit={(m) => {
          setEditingId(m.id);
          setActionsFor(null);
        }}
        onDelete={(m) => {
          setActionsFor(null);
          ops.remove(m);
        }}
      />
    </div>
  );
}
