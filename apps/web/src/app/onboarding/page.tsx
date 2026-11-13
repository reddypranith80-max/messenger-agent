import { Avatar, Badge, Card, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { ROLE_LABEL } from "@orbit/db/roles";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateWorkspaceForm } from "@/components/forms/create-workspace-form";
import { listWorkspaces, requireUser } from "@/server/context";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="px-1">
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight">
          {workspaces.length ? "New workspace" : `Welcome, ${user.name.split(" ")[0]}`}
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          A workspace is where your team chats, calls and meets. You can invite people next.
        </p>
      </header>

      <Card className="p-5">
        <CreateWorkspaceForm />
      </Card>

      {workspaces.length ? (
        <section>
          <SectionLabel>Your workspaces</SectionLabel>
          <Card>
            <RowList>
              {workspaces.map((w) => (
                <li key={w.id}>
                  <Link href={`/w/${w.slug}/chat`} className="pressable block hover:bg-muted">
                    <ListRow
                      leading={<Avatar name={w.name} src={w.imageUrl} shape="rounded" />}
                      title={w.name}
                      subtitle={`orbit/${w.slug}`}
                      trailing={
                        <>
                          <Badge>{ROLE_LABEL[w.role]}</Badge>
                          <ChevronRight className="size-5" />
                        </>
                      }
                    />
                  </Link>
                </li>
              ))}
            </RowList>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
