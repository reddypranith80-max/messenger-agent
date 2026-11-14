"use client";

import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useChat,
  useLocalParticipant,
  useParticipantAttributes,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Avatar, Button, cn } from "@orbit/ui";
import type { MeetingPerson } from "@orbit/db/meeting-types";
import { Track, type Participant } from "livekit-client";
import { Hand, MessageSquare, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";
import { fetchWaiting } from "@/server/meeting-actions";

type Props = { slug: string; kind: "channel" | "meeting"; meetingId?: string; title: string; canAdmit: boolean };
type Panel = "chat" | "people" | null;

export function RoomView({ slug, meetingId, title, canAdmit }: Props) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [panel, setPanel] = useState<Panel>(null);
  const { waiting, reload: reloadWaiting } = useWaiting(slug, canAdmit ? meetingId : undefined);
  const toggle = (next: Exclude<Panel, null>) => setPanel((cur) => (cur === next ? null : next));

  return (
    <div className="relative flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="min-w-0 truncate text-[17px] font-bold tracking-tight">{title}</h1>
        <RaisedHands />
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-2">
          <GridLayout tracks={tracks} style={{ height: "100%" }}>
            <ParticipantTile />
          </GridLayout>
        </div>
        {panel ? (
          <aside
            aria-label={panel === "chat" ? "In-call chat" : "People"}
            className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col rounded-t-[28px] bg-popover shadow-float md:static md:max-h-none md:w-80 md:rounded-none md:shadow-none md:ring-1 md:ring-border"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-[17px] font-bold">{panel === "chat" ? "Chat" : "People"}</h2>
              <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={() => setPanel(null)}>
                <X />
              </Button>
            </div>
            {panel === "chat" ? <ChatPanel /> : <PeoplePanel waiting={waiting} canAdmit={canAdmit} meetingId={meetingId} onDecided={reloadWaiting} />}
          </aside>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ControlBar controls={{ chat: false, settings: false }} />
        <HandButton />
        <Button variant={panel === "chat" ? "primary" : "secondary"} size="icon" aria-label="Chat" aria-pressed={panel === "chat"} onClick={() => toggle("chat")}>
          <MessageSquare />
        </Button>
        <Button variant={panel === "people" ? "primary" : "secondary"} size="icon" aria-label="People" aria-pressed={panel === "people"} onClick={() => toggle("people")} className="relative">
          <Users />
          {waiting.length > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground" aria-label={`${waiting.length} waiting`}>
              {waiting.length}
            </span>
          ) : null}
        </Button>
      </div>
      <RoomAudioRenderer />
    </div>
  );
}

// ------------------------------------------------------------------ chat

function ChatPanel() {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();

  const submit = async () => {
    const body = text.trim();
    if (!body || isSending) return;
    try {
      await send(body);
      setText("");
      setError(undefined);
    } catch {
      setError("Could not send. Try again.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="scrollbar-soft flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto px-5 py-2" aria-live="polite">
        {chatMessages.length === 0 ? <li className="text-[15px] text-muted-foreground">Messages here disappear when the call ends.</li> : null}
        {chatMessages.map((m, i) => (
          <li key={`${m.timestamp}-${i}`} className="text-[15px]">
            <span className="font-semibold">{m.from?.name ?? "Someone"}</span>
            <span className="ml-2 text-xs text-muted-foreground">{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(m.timestamp)}</span>
            <p className="break-words whitespace-pre-wrap">{m.message}</p>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="px-5 text-sm text-destructive">{error}</p> : null}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          aria-label="Message"
          placeholder="Message everyone"
          className="h-11 min-w-0 flex-1 rounded-full bg-input px-4 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
        />
        <Button type="submit" disabled={!text.trim() || isSending}>
          Send
        </Button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ raise hand

const isRaised = (attributes: Record<string, string> | undefined) => attributes?.hand === "1";

function HandButton() {
  const { localParticipant } = useLocalParticipant();
  const { attributes } = useParticipantAttributes({ participant: localParticipant });
  const raised = isRaised(attributes);
  return (
    <Button
      variant={raised ? "primary" : "secondary"}
      size="icon"
      aria-label={raised ? "Lower hand" : "Raise hand"}
      aria-pressed={raised}
      onClick={() => void localParticipant.setAttributes({ hand: raised ? "0" : "1" })}
    >
      <Hand />
    </Button>
  );
}

function HandChip({ participant }: { participant: Participant }) {
  const { attributes } = useParticipantAttributes({ participant });
  if (!isRaised(attributes)) return null;
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warning/30 px-3 text-sm font-semibold">
      <Hand className="size-4" /> {participant.name || participant.identity}
    </span>
  );
}

function RaisedHands() {
  const participants = useParticipants();
  return (
    <div className="flex flex-wrap justify-end gap-1.5" aria-live="polite">
      {participants.map((p) => (
        <HandChip key={p.identity} participant={p} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- people

function PeoplePanel({ waiting, canAdmit, meetingId, onDecided }: { waiting: MeetingPerson[]; canAdmit: boolean; meetingId?: string; onDecided: () => void }) {
  const participants = useParticipants();
  const { request } = useRealtime();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  const decide = async (userId: string, admit: boolean) => {
    if (!meetingId) return;
    setBusy(userId);
    setError(undefined);
    try {
      await request("meeting:decide", { meetingId, userId, admit });
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the lobby.");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {canAdmit && waiting.length ? (
        <section className="mb-3">
          <h3 className="px-2 pb-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Waiting to join</h3>
          <ul className="rounded-lg bg-muted/60">
            {waiting.map((p) => (
              <li key={p.userId} className="flex items-center gap-2 px-3 py-2">
                <Avatar name={p.name} src={p.imageUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.name}</span>
                <Button size="sm" disabled={busy === p.userId} onClick={() => void decide(p.userId, true)}>
                  Admit
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === p.userId} onClick={() => void decide(p.userId, false)}>
                  Deny
                </Button>
              </li>
            ))}
          </ul>
          {error ? <p role="alert" className="px-2 pt-1 text-sm text-destructive">{error}</p> : null}
        </section>
      ) : null}
      <h3 className="px-2 pb-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">In this call ({participants.length})</h3>
      <ul>
        {participants.map((p) => (
          <li key={p.identity} className="flex items-center gap-3 px-2 py-2">
            <Avatar name={p.name || p.identity} size="sm" />
            <span className={cn("min-w-0 flex-1 truncate text-[15px] font-medium")}>
              {p.name || p.identity}
              {p.isLocal ? <span className="text-muted-foreground"> (you)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** People in the lobby: loaded once, then kept current by live knocks and answers. */
function useWaiting(slug: string, meetingId: string | undefined): { waiting: MeetingPerson[]; reload: () => void } {
  const { socket } = useRealtime();
  const [waiting, setWaiting] = useState<MeetingPerson[]>([]);

  const reload = useCallback(() => {
    if (!meetingId) return;
    fetchWaiting(slug, meetingId).then(setWaiting, () => {});
  }, [slug, meetingId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!socket || !meetingId) return;
    const onKnock = (p: { meetingId: string }) => p.meetingId === meetingId && reload();
    socket.on("meeting:knock", onKnock);
    // Answers come from any admin; reload to drop whoever was just handled.
    const timer = setInterval(reload, 15_000);
    return () => {
      socket.off("meeting:knock", onKnock);
      clearInterval(timer);
    };
  }, [socket, meetingId, reload]);

  return { waiting, reload };
}
