"use client";

import { Button, Field, FieldError, Input, Label } from "@orbit/ui";
import { useActionState } from "react";
import { createWorkspace, type ActionState } from "@/server/actions";

const initial: ActionState = { ok: false };

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          placeholder="Acme Inc."
          autoComplete="organization"
          required
          minLength={2}
          maxLength={50}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "workspace-name-error" : undefined}
        />
        <FieldError id="workspace-name-error">{state.error}</FieldError>
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
