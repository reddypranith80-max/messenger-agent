"use client";

import { Button, Field, FieldError, Input, Label, Sheet } from "@orbit/ui";
import { LogOut, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { deleteWorkspace, leaveWorkspace, renameWorkspace, type ActionState } from "@/server/actions";

const initial: ActionState = { ok: false };

export function RenameWorkspaceForm({ slug, name }: { slug: string; name: string }) {
  const [state, action, pending] = useActionState(renameWorkspace.bind(null, slug), initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input id="workspace-name" name="name" defaultValue={name} minLength={2} maxLength={50} required />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <FieldError>{state.error}</FieldError>
        {state.ok ? (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Members can leave; the owner can delete the workspace after typing its name. */
export function LeaveOrDeleteWorkspace({ slug, name, isOwner }: { slug: string; name: string; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionState>) =>
    startTransition(async () => {
      // On success the action redirects away, so only failures come back here.
      const result = await work();
      if (!result.ok) setError(result.error);
    });

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-muted-foreground">Leaving removes you from every channel and meeting here. You will need a new invitation to come back.</p>
        <div>
          <Sheet
            open={open}
            onOpenChange={setOpen}
            title={`Leave ${name}?`}
            description="You will lose access to its conversations and meetings."
            trigger={
              <Button variant="outline" className="text-destructive">
                <LogOut /> Leave workspace
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              <Button variant="destructive" disabled={pending} onClick={() => run(() => leaveWorkspace(slug))}>
                {pending ? "Leaving…" : "Leave workspace"}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Stay
              </Button>
              <FieldError>{error}</FieldError>
            </div>
          </Sheet>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">Deleting the workspace permanently removes its channels, messages and meetings for everyone. This cannot be undone.</p>
      <div>
        <Sheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setTyped("");
            setError(undefined);
          }}
          title={`Delete ${name}?`}
          description="Everything in this workspace is erased for all members."
          trigger={
            <Button variant="outline" className="text-destructive">
              <Trash2 /> Delete workspace
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field>
              <Label htmlFor="confirm-delete">Type “{name}” to confirm</Label>
              <Input id="confirm-delete" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <Button variant="destructive" disabled={pending || typed.trim() !== name} onClick={() => run(() => deleteWorkspace(slug, typed))}>
              {pending ? "Deleting…" : "Delete forever"}
            </Button>
            <FieldError>{error}</FieldError>
          </div>
        </Sheet>
      </div>
    </div>
  );
}
