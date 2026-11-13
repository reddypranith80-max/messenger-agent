import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-8 py-12 text-center", className)}>
      {icon ? (
        <div className="flex size-16 items-center justify-center rounded-[30%] bg-secondary text-secondary-foreground [&_svg]:size-7">
          {icon}
        </div>
      ) : null}
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {description ? <p className="max-w-sm text-[15px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-muted motion-reduce:animate-none", className)} />;
}
