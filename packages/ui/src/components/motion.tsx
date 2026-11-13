"use client";

import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { spring } from "../lib/motion";

/** Wrap the app once: makes every framer-motion animation honour reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Spring-in for a page or pane. Use from a route `template.tsx`. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={cn("h-full", className)}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0.12 } : spring.page}
    >
      {children}
    </motion.div>
  );
}

/** Shared-layout highlight that slides between the active items of a nav. */
export function ActivePill({ layoutId, className }: { layoutId: string; className?: string }) {
  return <motion.span layoutId={layoutId} transition={spring.snappy} className={cn("absolute inset-0 -z-10", className)} />;
}
