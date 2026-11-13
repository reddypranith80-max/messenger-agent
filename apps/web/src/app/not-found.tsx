import { EmptyState, buttonVariants } from "@orbit/ui";
import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={<Compass />}
        title="Nothing here"
        description="This page does not exist, or you do not have access to it."
        action={
          <Link href="/app" className={buttonVariants()}>
            Back to Orbit
          </Link>
        }
      />
    </main>
  );
}
