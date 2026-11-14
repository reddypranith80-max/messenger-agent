"use client";

import "@livekit/components-styles";
import { LiveKitRoom, PreJoin, type LocalUserChoices } from "@livekit/components-react";
import { Button, Card, EmptyState, buttonVariants, cn } from "@orbit/ui";
import { PhoneOff, Settings2, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";
import { RoomView } from "./room-view";

type Props = {
  slug: string;
  kind: "channel" | "meeting";
  id: string;
  title: string;
  userName: string;
  configured: boolean;
  isHost: boolean;
  canAdmit: boolean;
  backHref: string;
};

type Phase =
  | { name: "prejoin" }
  | { name: "entering" }
  | { name: "lobby" }
  | { name: "blocked"; message: string }
  | { name: "live"; token: string; url: string };

type TokenResult = { ok: true; token: string; url: string } | { ok: false; error: string };

const BLOCKED: Record<string, string> = {
  denied: "The host did not let you in.",
  early: "This meeting opens 15 minutes before it starts. Come back then.",
  ended: "This meeting has ended.",
  forbidden: "You do not have access to this room.",
  not_configured: "Calls are not set up on this server yet.",
};

export function CallRoom({ slug, kind, id, title, userName, configured, isHost, canAdmit, backHref }: Props) {
  const router = useRouter();
  const { request, socket } = useRealtime();
  const [phase, setPhase] = useState<Phase>({ name: "prejoin" });
  const [choices, setChoices] = useState<LocalUserChoices | null>(null);
  const [error, setError] = useState<string>();
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });

  const fetchToken = useCallback(async (): Promise<TokenResult> => {
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, kind, id }),
      });
      const data = (await response.json().catch(() => ({}))) as { token?: string; url?: string; error?: string };
      if (response.ok && data.token && data.url) return { ok: true, token: data.token, url: data.url };
      return { ok: false, error: data.error ?? "unknown" };
    } catch {
      return { ok: false, error: "network" };
    }
  }, [slug, kind, id]);

  const enter = useCallback(async () => {
    setError(undefined);
    setPhase({ name: "entering" });
    const result = await fetchToken();
    if (result.ok) return setPhase({ name: "live", token: result.token, url: result.url });
    if (result.error === "waiting") return setPhase({ name: "lobby" });
    if (result.error === "knock") {
      try {
        const { decision } = await request<{ decision: string }>("meeting:knock", { meetingId: id });
        if (decision === "waiting") return setPhase({ name: "lobby" });
        if (decision === "denied") return setPhase({ name: "blocked", message: BLOCKED.denied! });
        const retry = await fetchToken();
        if (retry.ok) return setPhase({ name: "live", token: retry.token, url: retry.url });
        return setPhase({ name: "blocked", message: BLOCKED[retry.error] ?? "Could not join." });
      } catch (e) {
        setPhase({ name: "prejoin" });
        return setError(e instanceof Error ? e.message : "Could not ask the host to let you in.");
      }
    }
    if (result.error === "network") {
      setPhase({ name: "prejoin" });
      return setError("Could not reach the server. Check your connection and try again.");
    }
    setPhase({ name: "blocked", message: BLOCKED[result.error] ?? "Could not join this room." });
  }, [fetchToken, request, id]);

  // In the lobby: the host's answer arrives live; polling is the fallback if that message is missed.
  const inLobby = phase.name === "lobby";
  useEffect(() => {
    if (!inLobby) return;
    const onAnswered = (p: { meetingId: string; admitted: boolean }) => {
      if (p.meetingId !== id) return;
      if (p.admitted) void enter();
      else setPhase({ name: "blocked", message: BLOCKED.denied! });
    };
    socket?.on("meeting:answered", onAnswered);
    const poll = setInterval(async () => {
      const result = await fetchToken();
      if (result.ok && phaseRef.current.name === "lobby") setPhase({ name: "live", token: result.token, url: result.url });
      else if (!result.ok && result.error === "denied") setPhase({ name: "blocked", message: BLOCKED.denied! });
    }, 4000);
    return () => {
      socket?.off("meeting:answered", onAnswered);
      clearInterval(poll);
    };
  }, [inLobby, socket, id, enter, fetchToken]);

  const leave = useCallback(() => router.push(backHref), [router, backHref]);

  if (!configured) return <SetupNeeded backHref={backHref} />;

  if (phase.name === "live" && choices) {
    return (
      <LiveKitRoom
        token={phase.token}
        serverUrl={phase.url}
        connect
        video={choices.videoEnabled ? { deviceId: choices.videoDeviceId } : false}
        audio={choices.audioEnabled ? { deviceId: choices.audioDeviceId } : false}
        onDisconnected={leave}
        data-lk-theme="default"
        className="fixed inset-0"
      >
        <RoomView slug={slug} kind={kind} meetingId={kind === "meeting" ? id : undefined} title={title} canAdmit={canAdmit} />
      </LiveKitRoom>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{title}</h1>
        <p className="text-[15px] text-muted-foreground">{kind === "meeting" ? (isHost ? "You are the host" : "Meeting") : "Call"}</p>
      </header>

      {phase.name === "prejoin" || phase.name === "entering" ? (
        <div data-lk-theme="default" className="w-full max-w-md overflow-hidden rounded-card shadow-float">
          <PreJoin
            defaults={{ username: userName, videoEnabled: false, audioEnabled: true }}
            persistUserChoices={false}
            joinLabel={phase.name === "entering" ? "Joining…" : "Join"}
            userLabel="Your name"
            onSubmit={(values) => {
              setChoices(values);
              void enter();
            }}
            onError={(e) => setError(e.message)}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="max-w-md rounded-lg bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {phase.name === "lobby" ? (
        <Card className="w-full max-w-md p-6 text-center">
          <p className="text-lg font-bold">Waiting for the host</p>
          <p className="mt-1 text-[15px] text-muted-foreground">You will be let in as soon as the host admits you. Keep this page open.</p>
          <div className="mt-5 flex justify-center">
            <Button variant="secondary" onClick={leave}>
              Leave
            </Button>
          </div>
        </Card>
      ) : null}

      {phase.name === "blocked" ? (
        <Card className="w-full max-w-md">
          <EmptyState
            icon={<PhoneOff />}
            title="Cannot join"
            description={phase.message}
            action={
              <Link href={backHref} className={buttonVariants()}>
                Go back
              </Link>
            }
          />
        </Card>
      ) : null}
    </main>
  );
}

function SetupNeeded({ backHref }: { backHref: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground">
            <Settings2 className="size-5" />
          </span>
          <h1 className="text-xl font-extrabold tracking-tight">Calls need a LiveKit account</h1>
        </div>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Audio and video run on LiveKit. Orbit is ready for it, but this server has no LiveKit keys yet.
        </p>
        <ol className={cn("mt-4 list-decimal space-y-2 pl-5 text-[15px]")}>
          <li>
            Create a free project at <span className="font-semibold">cloud.livekit.io</span>.
          </li>
          <li>
            Copy its URL, API key and API secret into <code className="rounded bg-muted px-1.5 py-0.5 text-sm">.env</code> as{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">LIVEKIT_URL</code>,{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">LIVEKIT_API_KEY</code> and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">LIVEKIT_API_SECRET</code>.
          </li>
          <li>Restart the dev server and reload this page.</li>
        </ol>
        <div className="mt-6">
          <Link href={backHref} className={buttonVariants({ variant: "secondary" })}>
            <Video /> Back
          </Link>
        </div>
      </Card>
    </main>
  );
}
