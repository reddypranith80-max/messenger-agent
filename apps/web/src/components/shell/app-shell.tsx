"use client";

import { ActivePill, Avatar, cn, type Presence } from "@orbit/ui";
import Link from "next/link";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { useOptionalRealtime } from "@/components/chat/realtime-provider";
import { NAV_ITEMS } from "./nav";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./workspace-switcher";

type AppShellProps = {
  slug: string;
  workspace: SwitcherWorkspace;
  workspaces: SwitcherWorkspace[];
  user: { name: string; imageUrl: string | null; presence: Presence };
  children: ReactNode;
};

/**
 * Desktop: icon rail + the page's two panes (three panes in total).
 * Mobile: a single pane with a floating bottom navigation bar.
 */
export function AppShell({ slug, workspace, workspaces, user, children }: AppShellProps) {
  const active = useSelectedLayoutSegment() ?? "chat";
  const base = `/w/${slug}`;
  const realtime = useOptionalRealtime();
  const counts: Record<string, { n: number; what: string }> = {
    chat: { n: realtime?.totalUnread ?? 0, what: "unread messages" },
    activity: { n: realtime?.activityUnread ?? 0, what: "new notifications" },
  };
  const pathname = usePathname();
  // Inside a conversation on a phone the composer needs the bottom edge.
  const inConversation = active === "chat" && pathname.split("/").filter(Boolean).length >= 4;
  const badge = (segment: string) => {
    const count = counts[segment];
    if (!count || count.n <= 0) return null;
    return (
      <span className="absolute top-1 right-2.5 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground" aria-label={`${count.n} ${count.what}`}>
        {count.n > 99 ? "99+" : count.n}
      </span>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="hidden w-[84px] shrink-0 flex-col items-center gap-2 py-4 md:flex">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
        <nav aria-label="Main" className="mt-3 flex flex-1 flex-col items-center gap-1.5">
          {NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
            const isActive = active === segment;
            return (
              <Link
                key={segment}
                href={`${base}/${segment}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "pressable relative isolate flex w-16 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-semibold",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {isActive ? <ActivePill layoutId="rail-pill" className="rounded-2xl bg-card shadow-card" /> : null}
                <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                {label}
                {badge(segment)}
              </Link>
            );
          })}
        </nav>
        <Link
          href={`${base}/settings/profile`}
          aria-label={`Your profile (${user.name})`}
          className="pressable rounded-full"
        >
          <Avatar name={user.name} src={user.imageUrl} presence={user.presence} />
        </Link>
      </aside>

      <main id="main" className="min-w-0 flex-1 md:py-3 md:pr-3">
        {children}
      </main>

      {/* Mobile bottom navigation, within thumb reach */}
      <nav
        aria-label="Main"
        className={cn("fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden", inConversation && "hidden")}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-between rounded-[28px] bg-card/90 p-1.5 shadow-float backdrop-blur-xl">
          {NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
            const isActive = active === segment;
            return (
              <Link
                key={segment}
                href={`${base}/${segment}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "pressable relative isolate flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[22px] py-2 text-[11px] font-semibold",
                  isActive ? "text-secondary-foreground" : "text-muted-foreground",
                )}
              >
                {isActive ? <ActivePill layoutId="tab-pill" className="rounded-[22px] bg-secondary" /> : null}
                <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                <span className="truncate">{label}</span>
                {badge(segment)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
