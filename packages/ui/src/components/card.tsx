import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

/** The soft box: a large rounded surface that sits on the tinted background. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-card bg-card text-card-foreground shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-[17px] font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** Small uppercase label above a group of cards or rows. */
export function SectionLabel({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("px-5 pb-2 pt-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase", className)}
      {...props}
    />
  );
}

type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

/** Row content for grouped lists inside a Card. Wrap in a link or button to make it interactive. */
export function ListRow({ leading, title, subtitle, trailing, className }: ListRowProps) {
  return (
    <div className={cn("flex min-h-15 items-center gap-3 px-4 py-2.5", className)}>
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {subtitle ? <div className="truncate text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2 text-muted-foreground">{trailing}</div> : null}
    </div>
  );
}

/** Divides rows in a grouped list, inset to line up with the row text. */
export function RowList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("divide-y divide-border/70 overflow-hidden rounded-card [&>li]:list-none", className)}
      {...props}
    />
  );
}
