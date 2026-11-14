"use client";

import { Button, buttonVariants, cn } from "@orbit/ui";
import { channelTitle } from "@orbit/db/chat-types";
import { AtSign, CalendarClock, Phone, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";

type Banner = { key: string; kind: "call" | "meeting" | "activity"; text: string; sub: string; href: string };

/** Incoming calls and meeting reminders, shown over whatever page you are on. */
export function CallBanners() {
  const { socket, me, slug, channels } = useRealtime();
  const [banners, setBanners] = useState<Banner[]>([]);
  const channelsRef = useRef(channels);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    channelsRef.current = channels;
    pathRef.current = pathname;
  });

  useEffect(() => {
    if (!socket) return;
    const push = (banner: Banner) => {
      setBanners((cur) => [banner, ...cur.filter((b) => b.key !== banner.key)].slice(0, 3));
      const ttl = banner.kind === "call" ? 45_000 : banner.kind === "meeting" ? 120_000 : 8_000;
      setTimeout(() => setBanners((cur) => cur.filter((b) => b.key !== banner.key)), ttl);
    };
    const onCall = (p: { channelId: string; userId: string; name: string }) => {
      if (p.userId === me) return;
      const channel = channelsRef.current.find((c) => c.id === p.channelId);
      push({
        key: `call-${p.channelId}`,
        kind: "call",
        text: `${p.name} started a call`,
        sub: channel ? channelTitle(channel, me) : "Conversation",
        href: `/room/${slug}/channel/${p.channelId}`,
      });
    };
    const onReminder = (p: { meetingId: string; title: string }) =>
      push({ key: `meeting-${p.meetingId}`, kind: "meeting", text: `${p.title} starts soon`, sub: "Meeting reminder", href: `/w/${slug}/meetings/${p.meetingId}` });
    const onActivity = (p: { kind: "mention" | "reply"; channelId: string; messageId: string; actorName: string; text: string }) => {
      const href = `/w/${slug}/chat/${p.channelId}`;
      if (pathRef.current === href) return; // already looking at that conversation
      push({ key: `activity-${p.messageId}`, kind: "activity", text: p.kind === "mention" ? `${p.actorName} mentioned you` : `${p.actorName} replied to you`, sub: p.text, href });
    };
    socket.on("activity:new", onActivity);
    socket.on("call:started", onCall);
    socket.on("meeting:reminder", onReminder);
    return () => {
      socket.off("activity:new", onActivity);
      socket.off("call:started", onCall);
      socket.off("meeting:reminder", onReminder);
    };
  }, [socket, me, slug]);

  if (banners.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:items-end" role="region" aria-label="Notifications">
      {banners.map((b) => (
        <div key={b.key} role="alert" className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[24px] bg-popover p-3 pl-4 shadow-float">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", b.kind === "call" ? "bg-success/20 text-success" : "bg-secondary text-secondary-foreground")}>
            {b.kind === "call" ? <Phone className="size-5" /> : b.kind === "meeting" ? <CalendarClock className="size-5" /> : <AtSign className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{b.text}</p>
            <p className="truncate text-sm text-muted-foreground">{b.sub}</p>
          </div>
          <Link href={b.href} onClick={() => setBanners((cur) => cur.filter((x) => x.key !== b.key))} className={buttonVariants({ size: "sm" })}>
            {b.kind === "call" ? "Join" : "Open"}
          </Link>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setBanners((cur) => cur.filter((x) => x.key !== b.key))}>
            <X />
          </Button>
        </div>
      ))}
    </div>
  );
}
