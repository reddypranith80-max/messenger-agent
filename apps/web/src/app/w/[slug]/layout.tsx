import type { Metadata } from "next";
import type { ReactNode } from "react";
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
  const { user, workspace, membership } = await requireWorkspace(slug);
  const workspaces = await listWorkspaces(user.id);

  return (
    <AppShell
      slug={workspace.slug}
      workspace={{ slug: workspace.slug, name: workspace.name, imageUrl: workspace.imageUrl, role: membership.role }}
      workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name, imageUrl: w.imageUrl, role: w.role }))}
      user={{ name: user.name, imageUrl: user.imageUrl, presence: user.presence }}
    >
      {children}
    </AppShell>
  );
}
