"use client";

import { Avatar, Badge, ListRow, RowList, Sheet, buttonVariants, cn } from "@orbit/ui";
import { ROLE_LABEL, type RoleName } from "@orbit/db/roles";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type SwitcherWorkspace = { slug: string; name: string; imageUrl: string | null; role: RoleName };

export function WorkspaceSwitcher({
  current,
  workspaces,
  className,
}: {
  current: SwitcherWorkspace;
  workspaces: SwitcherWorkspace[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Workspaces"
      description="Switch workspace or create a new one."
      trigger={
        <button
          type="button"
          aria-label={`Workspace: ${current.name}. Switch workspace`}
          className={cn("pressable rounded-[30%]", className)}
        >
          <Avatar name={current.name} src={current.imageUrl} shape="rounded" size="md" className="size-12" />
        </button>
      }
    >
      <RowList className="bg-muted/60">
        {workspaces.map((w) => (
          <li key={w.slug}>
            <Link
              href={`/w/${w.slug}/chat`}
              onClick={() => setOpen(false)}
              aria-current={w.slug === current.slug ? "true" : undefined}
              className="pressable block hover:bg-muted"
            >
              <ListRow
                leading={<Avatar name={w.name} src={w.imageUrl} shape="rounded" />}
                title={w.name}
                subtitle={`orbit/${w.slug}`}
                trailing={
                  <>
                    <Badge variant={w.role === "OWNER" ? "accent" : "neutral"}>{ROLE_LABEL[w.role]}</Badge>
                    {w.slug === current.slug ? <Check className="size-5 text-primary" aria-label="Current" /> : null}
                  </>
                }
              />
            </Link>
          </li>
        ))}
      </RowList>
      <Link href="/onboarding" className={cn(buttonVariants({ variant: "secondary" }), "mt-4 w-full")}>
        <Plus /> New workspace
      </Link>
    </Sheet>
  );
}
