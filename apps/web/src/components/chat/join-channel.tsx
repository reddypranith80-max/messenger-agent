"use client";

import { Button, EmptyState, FieldError } from "@orbit/ui";
import type { ChannelDTO } from "@orbit/db/chat-types";
import { Hash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRealtime } from "./realtime-provider";

/** Shown instead of a conversation the user can see but has not joined (a public channel). */
export function JoinChannel({ channelId, name, topic }: { channelId: string; name: string; topic: string | null }) {
  const { request, slug } = useRealtime();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const join = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await request<ChannelDTO>("channel:join", { channelId });
      router.refresh();
      router.replace(`/w/${slug}/chat/${channelId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join.");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<Hash />}
        title={`#${name}`}
        description={topic ?? "You are not in this channel yet."}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" disabled={busy} onClick={() => void join()}>
              Join channel
            </Button>
            <FieldError>{error}</FieldError>
          </div>
        }
      />
    </div>
  );
}
