import { Card, EmptyState } from "@orbit/ui";
import { AtSign, Bell } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PagePane, Panes } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireWorkspace(slug);

  return (
    <Panes
      list={
        <PagePane title="Activity" subtitle="Mentions, replies and invites">
          <Card>
            <EmptyState icon={<Bell />} title="You're all caught up" description="New notifications will show up here." />
          </Card>
        </PagePane>
      }
      detail={
        <ComingSoon
          icon={<AtSign />}
          title="Notifications"
          description="In-app notifications, browser push and an email digest for messages you missed."
          phase={5}
        />
      }
    />
  );
}
