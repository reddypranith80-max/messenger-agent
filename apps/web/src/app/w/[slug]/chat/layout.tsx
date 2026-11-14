import { isAtLeast } from "@orbit/db";
import type { ReactNode } from "react";
import { ChatList } from "@/components/chat/chat-list";
import { SegmentPanes } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export default async function ChatLayout({ params, children }: { params: Promise<{ slug: string }>; children: ReactNode }) {
  const { slug } = await params;
  const { workspace, membership } = await requireWorkspace(slug);
  return <SegmentPanes list={<ChatList workspaceName={workspace.name} canCreate={isAtLeast(membership.role, "MEMBER")} />} detail={children} />;
}
