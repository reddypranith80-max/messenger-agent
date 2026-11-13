"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { spring } from "../lib/motion";

const DESKTOP = "(min-width: 768px)";

function useIsDesktop(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(DESKTOP);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

type SheetProps = {
  title: string;
  description?: string;
  /** Element that opens the sheet. */
  trigger?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/**
 * Modal surface. Slides up from the bottom on phones (drag down to dismiss)
 * and appears as a centred card on larger screens.
 */
export function Sheet({ title, description, trigger, children, open, onOpenChange, className }: SheetProps) {
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  const isDesktop = useIsDesktop();
  const reduced = useReducedMotion();

  const hidden = reduced ? { opacity: 0 } : isDesktop ? { opacity: 0, y: 24, scale: 0.97 } : { y: "100%" };
  const shown = reduced ? { opacity: 1 } : isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) setOpen(false);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <AnimatePresence>
        {isOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
              <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
                <motion.div
                  className={cn(
                    "pointer-events-auto relative flex max-h-[90dvh] w-full flex-col bg-popover text-popover-foreground shadow-float outline-none",
                    "rounded-t-[28px] pb-safe md:max-w-md md:rounded-card",
                    className,
                  )}
                  initial={hidden}
                  animate={shown}
                  exit={hidden}
                  transition={reduced ? { duration: 0.15 } : spring.sheet}
                  drag={isDesktop || reduced ? false : "y"}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={onDragEnd}
                >
                  <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 md:hidden" />
                  <div className="flex items-start gap-3 px-6 pt-4 md:pt-6">
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="text-xl font-bold tracking-tight">{title}</Dialog.Title>
                      {description ? (
                        <Dialog.Description className="mt-1 text-[15px] text-muted-foreground">
                          {description}
                        </Dialog.Description>
                      ) : null}
                    </div>
                    <Dialog.Close
                      aria-label="Close"
                      className="pressable -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-[18px]" />
                    </Dialog.Close>
                  </div>
                  <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">{children}</div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export const SheetClose = Dialog.Close;
