import { countNewActivity, ensureDefaultChannels, listChannelsForUser, listDirectory } from "@orbit/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CallBanners } from "@/components/calls/call-banners";
import { RealtimeProvider } from "@/components/chat/realtime-provider";
import { AppShell } from "@/components/shell/app-shell";
import { listWorkspaces, requireWorkspace } from "@/server/context";

type Props = { params: Promise<{ slug: string }>; children: ReactNode };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  return { title: { default: workspace.name, template: `%s · ${workspace.name} · Orbit` } };
}

export default async function WorkspaceLayout({ params, children }: Props) {
  const { slug } = await params;
  const { user, workspace, membership, db } = await requireWorkspace(slug);
  await ensureDefaultChannels(db, { userId: user.id, role: membership.role });
  const [workspaces, channels, newActivity, directory] = await Promise.all([
    listWorkspaces(user.id),
    listChannelsForUser(db, user.id),
    countNewActivity(db, user.id),
    listDirectory(db, { userId: user.id, role: membership.role }),
  ]);

  return (
    <RealtimeProvider
      slug={workspace.slug}
      workspaceId={workspace.id}
      me={user.id}
      url={process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000"}
      initialChannels={channels}
      initialActivity={newActivity}
      people={directory}
    >
      <AppShell
        slug={workspace.slug}
        workspace={{ slug: workspace.slug, name: workspace.name, imageUrl: workspace.imageUrl, role: membership.role }}
        workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name, imageUrl: w.imageUrl, role: w.role }))}
        user={{ name: user.name, imageUrl: user.imageUrl, presence: user.presence }}
      >
        {children}
      </AppShell>
      <CallBanners />
    </RealtimeProvider>
  );
}
