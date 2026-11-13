import { PageTransition } from "@orbit/ui";
import type { ReactNode } from "react";

/** Remounts when the section changes, so each section springs in. */
export default function SectionTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
