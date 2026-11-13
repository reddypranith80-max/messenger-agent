"use client";

import { Button, Field, FieldError, Input, Label, Select } from "@orbit/ui";
import { ROLE_LABEL, type RoleName } from "@orbit/db/roles";
import { useActionState } from "react";
import { inviteMember, type ActionState } from "@/server/actions";

const initial: ActionState = { ok: false };

const ROLE_HINT: Record<RoleName, string> = {
  OWNER: "",
  ADMIN: "manages members and settings",
  MEMBER: "full access to chat, calls and meetings",
  GUEST: "limited access, for people outside the team",
};

export function InviteForm({ slug, roles }: { slug: string; roles: RoleName[] }) {
  const [state, action, pending] = useActionState(inviteMember.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="invite-email">Email address</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="teammate@company.com"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Field>
        <Label htmlFor="invite-role">Role</Label>
        <Select id="invite-role" name="role" defaultValue={roles.includes("MEMBER") ? "MEMBER" : roles[0]}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}: {ROLE_HINT[role]}
            </option>
          ))}
        </Select>
      </Field>
      <FieldError>{state.error}</FieldError>
      {state.ok ? (
        <p role="status" className="text-sm font-medium text-success">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
