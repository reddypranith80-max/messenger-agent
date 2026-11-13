import { PageTransition } from "@orbit/ui";
import type { ReactNode } from "react";

export default function SettingsTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
