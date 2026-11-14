import { activitySeenAt, listActivity } from "@orbit/db";
import { EmptyState } from "@orbit/ui";
import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Panes } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, db } = await requireWorkspace(slug);
  const [items, seenAt] = await Promise.all([listActivity(db, user.id), activitySeenAt(db, user.id)]);

  return (
    <Panes
      list={<ActivityFeed initialItems={items} seenAt={seenAt.toISOString()} />}
      detail={
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={<Bell />}
            title="Your activity"
            description="Mentions, replies to your messages and meeting invitations are collected here. Pick one to jump straight to it."
          />
        </div>
      }
    />
  );
}
