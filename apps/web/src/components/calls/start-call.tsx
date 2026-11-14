"use client";

import { Button } from "@orbit/ui";
import { Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";

/** Starts a call in a conversation: tells the others, then opens the room. */
export function StartCall({ channelId, label, variant = "secondary", size = "icon-sm" }: { channelId: string; label?: string; variant?: "secondary" | "primary" | "ghost"; size?: "icon-sm" | "sm" }) {
  const { request, slug } = useRealtime();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await request("call:start", { channelId });
      router.push(`/room/${slug}/channel/${channelId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call.");
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} aria-label={label ?? "Start a call"} disabled={busy} onClick={() => void start()}>
        <Video />
        {label && size !== "icon-sm" ? label : null}
      </Button>
      {error ? (
        <span role="alert" className="sr-only">
          {error}
        </span>
      ) : null}
    </>
  );
}
