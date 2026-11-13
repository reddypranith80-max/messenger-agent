"use client";

import { Button, Field, FieldError, Input, Label, PRESENCE_LABEL, PresenceDot, cn, type Presence } from "@orbit/ui";
import { useActionState, useState } from "react";
import { updateProfile, type ActionState } from "@/server/actions";

const initial: ActionState = { ok: false };
const OPTIONS: Presence[] = ["ONLINE", "AWAY", "BUSY", "OFFLINE"];

export function ProfileForm({ presence, statusText }: { presence: Presence; statusText: string }) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  const [selected, setSelected] = useState<Presence>(presence);

  return (
    <form action={action} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Presence</legend>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((option) => (
            <label
              key={option}
              className={cn(
                "pressable flex h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-4 text-[15px] font-medium has-focus-visible:ring-4 has-focus-visible:ring-ring/20",
                selected === option ? "border-primary bg-secondary text-secondary-foreground" : "border-transparent bg-muted",
              )}
            >
              <input
                type="radio"
                name="presence"
                value={option}
                checked={selected === option}
                onChange={() => setSelected(option)}
                className="sr-only"
              />
              <PresenceDot presence={option} className="ring-0" />
              {PRESENCE_LABEL[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field>
        <Label htmlFor="status-text">Status message</Label>
        <Input id="status-text" name="statusText" defaultValue={statusText} maxLength={80} placeholder="In a meeting until 3" />
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
