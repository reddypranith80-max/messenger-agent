import { Avatar, Card, ListRow, SectionLabel } from "@orbit/ui";
import type { Metadata } from "next";
import { ProfileForm } from "@/components/forms/profile-form";
import { BackLink, PagePane } from "@/components/shell/panes";
import { requireWorkspace } from "@/server/context";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user } = await requireWorkspace(slug);

  return (
    <PagePane title="Profile" leading={<BackLink href={`/w/${slug}/settings`} label="Back to settings" />}>
      <Card className="md:shadow-none md:ring-1 md:ring-border">
        <ListRow
          className="py-4"
          leading={<Avatar name={user.name} src={user.imageUrl} size="lg" presence={user.presence} />}
          title={<span className="text-[17px] font-semibold">{user.name}</span>}
          subtitle={user.email}
        />
      </Card>

      <section>
        <SectionLabel>Status</SectionLabel>
        <Card className="p-5 md:shadow-none md:ring-1 md:ring-border">
          <ProfileForm presence={user.presence} statusText={user.statusText ?? ""} />
        </Card>
      </section>

      <p className="px-5 text-sm text-muted-foreground">
        Your name, photo, password and two-factor authentication are managed in your account security settings.
      </p>
    </PagePane>
  );
}
