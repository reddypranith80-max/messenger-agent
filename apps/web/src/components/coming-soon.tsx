import { Badge, EmptyState } from "@orbit/ui";
import type { ReactNode } from "react";

/** Honest placeholder for a feature that a later build phase delivers. */
export function ComingSoon({
  icon,
  title,
  description,
  phase,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={<Badge variant="accent">Arrives in phase {phase}</Badge>}
      />
    </div>
  );
}

/** Body of a primary-action sheet for a feature that is not built yet. */
export function NotYet({ what, phase }: { what: string; phase: number }) {
  return (
    <p className="rounded-lg bg-muted p-4 text-[15px] text-muted-foreground">
      {what} is not built yet. It arrives in phase {phase} of the build plan.
    </p>
  );
}
