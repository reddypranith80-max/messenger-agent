import type { ReactNode } from "react";
import { RealtimeProvider } from "@/components/chat/realtime-provider";
import { requireWorkspace } from "@/server/context";

/** Rooms use the realtime connection (lobby, call notices) but not the app shell, so video can fill the screen. */
export default async function RoomLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  return (
    <RealtimeProvider
      slug={workspace.slug}
      workspaceId={workspace.id}
      me={user.id}
      url={process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000"}
      initialChannels={[]}
      people={[]}
    >
      {children}
    </RealtimeProvider>
  );
}
