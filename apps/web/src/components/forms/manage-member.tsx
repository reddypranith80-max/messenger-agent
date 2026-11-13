"use client";

import { Button, FieldError, Sheet } from "@orbit/ui";
import { ROLE_LABEL, type RoleName } from "@orbit/db/roles";
import { Ellipsis, X } from "lucide-react";
import { useState, useTransition } from "react";
import { changeMemberRole, removeMember, revokeInvitation, type ActionState } from "@/server/actions";

type ManageMemberProps = {
  slug: string;
  membershipId: string;
  name: string;
  role: RoleName;
  /** Roles the current user may assign to this member. */
  roles: RoleName[];
  removable: boolean;
};

export function ManageMember({ slug, membershipId, name, role, roles, removable }: ManageMemberProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        setError(undefined);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={name}
      description={`Currently ${ROLE_LABEL[role]}`}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${name}`}>
          <Ellipsis />
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {roles.map((next) => (
          <Button
            key={next}
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => changeMemberRole(slug, membershipId, next))}
          >
            Make {ROLE_LABEL[next]}
          </Button>
        ))}
        {removable ? (
          <Button variant="destructive" disabled={pending} onClick={() => run(() => removeMember(slug, membershipId))}>
            Remove from workspace
          </Button>
        ) : null}
        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}

export function RevokeInvitationButton({ slug, invitationId, email }: { slug: string; invitationId: string; email: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Revoke invitation for ${email}`}
      disabled={pending}
      onClick={() => startTransition(async () => void (await revokeInvitation(slug, invitationId)))}
    >
      <X />
    </Button>
  );
}
