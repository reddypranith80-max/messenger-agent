import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const field =
  "w-full rounded-lg border border-transparent bg-input px-4 text-[15px] text-foreground placeholder:text-muted-foreground/80 transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-50 aria-invalid:border-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(field, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(field, "min-h-24 py-3", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="select" className={cn(field, "h-12 appearance-none pr-10", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function FieldError({ className, children, ...props }: ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-sm text-destructive", className)} {...props}>
      {children}
    </p>
  );
}
