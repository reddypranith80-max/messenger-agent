"use client";

import { Button, FieldError, buttonVariants, cn } from "@orbit/ui";
import { joinWindow } from "@orbit/db/meeting-types";
import { Check, Copy, Video, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelMeetingAction } from "@/server/meeting-actions";

type Props = { slug: string; meetingId: string; link: string; startsAt: string; endsAt: string; isHost: boolean; canCancel: boolean };

export function MeetingActions({ slug, meetingId, link, startsAt, endsAt, isHost, canCancel }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [window_, setWindow] = useState<"early" | "open" | "ended">(() => joinWindow({ startsAt, endsAt }));

  // The join button wakes up when the meeting opens.
  useEffect(() => {
    const id = setInterval(() => setWindow(joinWindow({ startsAt, endsAt })), 15_000);
    return () => clearInterval(id);
  }, [startsAt, endsAt]);

  const canJoin = isHost || window_ === "open";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canJoin ? (
          <Link href={`/room/${slug}/meeting/${meetingId}`} className={buttonVariants({ size: "lg" })}>
            <Video /> {isHost ? "Start meeting" : "Join meeting"}
          </Link>
        ) : (
          <Button size="lg" disabled>
            <Video /> {window_ === "early" ? "Opens 15 minutes before" : "Meeting ended"}
          </Button>
        )}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy join link"}
        </Button>
        {canCancel ? (
          <Button
            variant="ghost"
            size="lg"
            className={cn("text-destructive")}
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Cancel this meeting for everyone?")) return;
              startTransition(async () => {
                const result = await cancelMeetingAction(slug, meetingId);
                if (!result.ok) return setError(result.error);
                router.push(`/w/${slug}/meetings`);
              });
            }}
          >
            <XCircle /> Cancel
          </Button>
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
