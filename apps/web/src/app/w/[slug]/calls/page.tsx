import { Card, EmptyState } from "@orbit/ui";
import { Phone, PhoneCall, Video } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon, NotYet } from "@/components/coming-soon";
import { PagePane, Panes, PrimaryAction } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Calls" };

export default async function CallsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireWorkspace(slug);

  return (
    <Panes
      list={
        <PagePane
          title="Calls"
          subtitle="Recent and ongoing"
          actions={
            <PrimaryAction label="New call" icon={<PhoneCall />} sheetTitle="Start a call">
              <NotYet what="Calling" phase={3} />
            </PrimaryAction>
          }
        >
          <Card>
            <EmptyState icon={<Phone />} title="No calls yet" description="Calls you make or miss will be listed here." />
          </Card>
        </PagePane>
      }
      detail={
        <ComingSoon
          icon={<Video />}
          title="Audio and video calls"
          description="One-to-one and group calls with screen sharing, device controls and in-call chat."
          phase={3}
        />
      }
    />
  );
}
