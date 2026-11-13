import { Card, SectionLabel } from "@orbit/ui";
import type { Metadata } from "next";
import { BackLink, PagePane } from "@/components/shell/panes";
import { ThemePicker } from "@/components/theme-picker";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <PagePane title="Appearance" leading={<BackLink href={`/w/${slug}/settings`} label="Back to settings" />}>
      <section>
        <SectionLabel>Theme</SectionLabel>
        <Card className="p-5 md:shadow-none md:ring-1 md:ring-border">
          <ThemePicker />
          <p className="mt-4 text-sm text-muted-foreground">
            System follows your device. Animations are reduced automatically when your device asks for less motion.
          </p>
        </Card>
      </section>
    </PagePane>
  );
}
