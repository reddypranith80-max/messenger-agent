import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link href="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-[30%] bg-primary text-primary-foreground">
          <span className="size-3.5 rounded-full border-[3px] border-current" />
        </span>
        Orbit
      </Link>
      {children}
    </div>
  );
}
