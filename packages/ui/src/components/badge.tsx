import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const badgeVariants = cva("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      accent: "bg-secondary text-secondary-foreground",
      neutral: "bg-muted text-muted-foreground",
      solid: "bg-primary text-primary-foreground",
      outline: "border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
