"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";

type ScrollPaneProps = {
  title: string;
  subtitle?: ReactNode;
  /** Left of the compact bar, e.g. a back button. */
  leading?: ReactNode;
  /** Right of the compact bar. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * A scrolling column with a big bold title that shrinks into a compact,
 * blurred bar as the content scrolls under it.
 */
export function ScrollPane({ title, subtitle, leading, actions, children, className, contentClassName }: ScrollPaneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll({ container: ref });

  const barOpacity = useTransform(scrollY, [24, 56], [0, 1]);
  const largeOpacity = useTransform(scrollY, [8, 52], [1, 0]);
  const largeScale = useTransform(scrollY, [0, 56], [1, reduced ? 1 : 0.88]);
  const largeY = useTransform(scrollY, [0, 56], [0, reduced ? 0 : -6]);

  return (
    <div ref={ref} className={cn("scrollbar-soft relative h-full overflow-y-auto overscroll-contain", className)}>
      <div className="sticky top-0 z-20 flex h-14 items-center gap-2 px-4 pt-safe">
        <motion.div
          aria-hidden
          style={{ opacity: barOpacity }}
          className="absolute inset-0 border-b border-border/70 bg-background/80 backdrop-blur-xl"
        />
        <div className="relative flex min-w-9 items-center">{leading}</div>
        <motion.div
          aria-hidden
          style={{ opacity: barOpacity }}
          className="pointer-events-none relative min-w-0 flex-1 truncate text-center text-[17px] font-semibold"
        >
          {title}
        </motion.div>
        <div className="relative flex min-w-9 items-center justify-end gap-1">{actions}</div>
      </div>

      <motion.header
        style={{ opacity: largeOpacity, scale: largeScale, y: largeY, transformOrigin: "left bottom" }}
        className="px-5 pb-4"
      >
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[15px] text-muted-foreground">{subtitle}</p> : null}
      </motion.header>

      <div className={cn("flex flex-col gap-5 px-3 pb-8", contentClassName)}>{children}</div>
    </div>
  );
}
