"use client";

import type { MessageDTO } from "@orbit/db/chat-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "./realtime-provider";

const byCreated = (a: MessageDTO, b: MessageDTO) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Insert or replace by id, keeping chronological order. */
export function upsertMessage(list: MessageDTO[], message: MessageDTO): MessageDTO[] {
  const exists = list.some((m) => m.id === message.id);
  return exists ? list.map((m) => (m.id === message.id ? message : m)) : [...list, message].sort(byCreated);
}

type Options = {
  channelId: string;
  /** null for the channel timeline, a message id for a thread. */
  parentId: string | null;
  initial: MessageDTO[];
  /** Fetch the latest messages, to catch up after the connection drops. */
  refetch: () => Promise<MessageDTO[]>;
};

/** Messages that stay current through the realtime connection. */
export function useLiveMessages({ channelId, parentId, initial, refetch }: Options) {
  const { socket } = useRealtime();
  const [messages, setMessages] = useState(initial);
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    if (!socket) return;
    const bumpReplies = (rootId: string, by: number) =>
      setMessages((list) => list.map((m) => (m.id === rootId ? { ...m, replyCount: Math.max(0, m.replyCount + by) } : m)));

    const onNew = (m: MessageDTO) => {
      if (m.channelId !== channelId) return;
      if (m.parentId === parentId) setMessages((list) => (list.some((x) => x.id === m.id) ? list : upsertMessage(list, m)));
      else if (parentId === null && m.parentId) bumpReplies(m.parentId, 1);
    };
    const onUpdated = (m: MessageDTO) => {
      if (m.channelId === channelId && m.parentId === parentId) setMessages((list) => upsertMessage(list, m));
    };
    const onDeleted = (p: { channelId: string; id: string; parentId: string | null }) => {
      if (p.channelId !== channelId) return;
      if (p.parentId === parentId) {
        setMessages((list) =>
          list.map((m) => (m.id === p.id ? { ...m, deleted: true, body: "", mentionIds: [], reactions: [] } : m)),
        );
      } else if (parentId === null && p.parentId) bumpReplies(p.parentId, -1);
    };
    const onReaction = (p: { channelId: string; messageId: string; reactions: MessageDTO["reactions"] }) => {
      if (p.channelId !== channelId) return;
      setMessages((list) => list.map((m) => (m.id === p.messageId ? { ...m, reactions: p.reactions } : m)));
    };
    let connectedBefore = socket.connected;
    const onConnect = () => {
      if (connectedBefore) {
        refetchRef.current().then(
          (fresh) => setMessages((list) => fresh.reduce(upsertMessage, list)),
          () => {},
        );
      }
      connectedBefore = true;
    };

    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    socket.on("reaction:updated", onReaction);
    socket.on("connect", onConnect);
    return () => {
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
      socket.off("reaction:updated", onReaction);
      socket.off("connect", onConnect);
    };
  }, [socket, channelId, parentId]);

  const add = useCallback((message: MessageDTO) => setMessages((list) => upsertMessage(list, message)), []);
  return { messages, setMessages, add };
}
