"use client";

import { MotionProvider } from "@orbit/ui";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <MotionProvider>{children}</MotionProvider>
    </ThemeProvider>
  );
}
