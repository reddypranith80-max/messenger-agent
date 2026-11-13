"use client";

import { Button, Card, ScrollPane, Sheet, buttonVariants, cn } from "@orbit/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";

type PanesProps = {
  list: ReactNode;
  detail: ReactNode;
  /** Which pane a phone shows. Desktop always shows both. */
  mobile?: "list" | "detail";
};

/** The list and detail panes. With the shell's rail they make the three-pane desktop layout. */
export function Panes({ list, detail, mobile = "list" }: PanesProps) {
  return (
    <div className="flex h-full md:gap-3">
      <section
        aria-label="List"
        className={cn("h-full w-full md:w-[340px] md:shrink-0 lg:w-[380px]", mobile === "detail" && "hidden md:block")}
      >
        {list}
      </section>
      <section aria-label="Detail" className={cn("h-full min-w-0 flex-1", mobile === "list" && "hidden md:block")}>
        <Card className="h-full overflow-hidden max-md:rounded-none max-md:bg-transparent max-md:shadow-none">{detail}</Card>
      </section>
    </div>
  );
}

/** Panes for a section with sub-pages: phones show the list at the index and the detail on a sub-page. */
export function SegmentPanes({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  return <Panes list={list} detail={detail} mobile={segment ? "detail" : "list"} />;
}

/** ScrollPane with room for the floating bottom navigation on phones. */
export function PagePane({ contentClassName, ...props }: ComponentProps<typeof ScrollPane>) {
  return <ScrollPane contentClassName={cn("pb-32 md:pb-8", contentClassName)} {...props} />;
}

/** Back button for detail panes; only phones need it. */
export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "md:hidden")}>
      <ChevronLeft />
    </Link>
  );
}

type PrimaryActionProps = {
  label: string;
  icon: ReactNode;
  sheetTitle: string;
  sheetDescription?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * A page's main action. On phones it floats above the bottom navigation,
 * within thumb reach; on desktop it sits in the header. Both open one sheet.
 */
export function PrimaryAction({ label, icon, sheetTitle, sheetDescription, children }: PrimaryActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={label}
        className="hidden md:inline-flex"
        onClick={() => setOpen(true)}
      >
        {icon}
      </Button>
      <Button
        size="lg"
        className="fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 shadow-float md:hidden"
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={sheetTitle} description={sheetDescription}>
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </Sheet>
    </>
  );
}
