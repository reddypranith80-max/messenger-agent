"use client";

import type { MessageDTO, ReactionDTO } from "@orbit/db/chat-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "./realtime-provider";

/** Reaction, edit and delete requests, with a transient error notice. */
export function useMessageOps(onUpdated: (message: MessageDTO) => void) {
  const { request } = useRealtime();
  const [notice, setNotice] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fail = useCallback((error: unknown) => {
    setNotice(error instanceof Error ? error.message : "Something went wrong.");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(undefined), 4000);
  }, []);

  const react = useCallback(
    (message: MessageDTO, emoji: string) => {
      request<ReactionDTO[]>("reaction:toggle", { messageId: message.id, emoji }).catch(fail);
    },
    [request, fail],
  );

  const edit = useCallback(
    async (message: MessageDTO, body: string) => {
      const updated = await request<MessageDTO>("message:edit", { id: message.id, body });
      onUpdated(updated);
    },
    [request, onUpdated],
  );

  const remove = useCallback(
    (message: MessageDTO) => {
      if (!window.confirm("Delete this message? This cannot be undone.")) return;
      request("message:delete", { id: message.id }).catch(fail);
    },
    [request, fail],
  );

  return { notice, react, edit, remove, fail };
}
