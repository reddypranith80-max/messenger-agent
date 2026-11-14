"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Button } from "@orbit/ui";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncAccount } from "@/server/actions";

/**
 * Name, photo, email, password and two-factor authentication live in the
 * sign-in provider's account screen. When something changes there, copy it
 * into Orbit so teammates see it straight away.
 */
export function AccountSettings({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const clerk = useClerk();
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const liveName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "" : null;
  const liveImage = user ? (user.hasImage ? user.imageUrl : null) : undefined;

  useEffect(() => {
    if (!isLoaded || liveName === null) return;
    if ((liveName && liveName !== name) || liveImage !== imageUrl) {
      syncAccount().then(
        (changed) => changed && router.refresh(),
        () => {},
      );
    }
  }, [isLoaded, liveName, liveImage, name, imageUrl, router]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">Change your name, photo, email address or password, turn on two-factor authentication, and review signed-in devices.</p>
      <div>
        <Button variant="secondary" onClick={() => clerk.openUserProfile()}>
          <ShieldCheck /> Manage account and security
        </Button>
      </div>
    </div>
  );
}
