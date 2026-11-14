"use client";

import { Avatar, Button, Field, FieldError, Input, Label, Textarea, cn } from "@orbit/ui";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useRealtime } from "@/components/chat/realtime-provider";
import { scheduleMeeting } from "@/server/meeting-actions";

/** `datetime-local` value (viewer's local time) for a Date. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

export function ScheduleForm({ slug, onDone, defaultDay }: { slug: string; onDone: () => void; defaultDay?: Date }) {
  const { people, online } = useRealtime();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const [initial] = useState(() => {
    const start = nextHalfHour();
    if (defaultDay) {
      start.setFullYear(defaultDay.getFullYear(), defaultDay.getMonth(), defaultDay.getDate());
      start.setHours(10, 0, 0, 0);
    }
    return { start, end: new Date(start.getTime() + 30 * 60_000) };
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial.start));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial.end));
  const [invitees, setInvitees] = useState<string[]>([]);
  const [lobby, setLobby] = useState(true);

  const submit = () => {
    setError(undefined);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setError("Pick a start and end time.");
    startTransition(async () => {
      // datetime-local has no zone; the browser knows the viewer's, so convert here.
      const result = await scheduleMeeting(slug, {
        title,
        description,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        inviteeIds: invitees,
        lobbyEnabled: lobby,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      router.push(`/w/${slug}/meetings/${result.id}`);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="meeting-title">Title</Label>
        <Input id="meeting-title" value={title} maxLength={120} placeholder="Weekly sync" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <Label htmlFor="meeting-start">Starts</Label>
          <Input
            id="meeting-start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => {
              const next = e.target.value;
              // Keep the same duration when the start moves.
              const length = new Date(endsAt).getTime() - new Date(startsAt).getTime();
              setStartsAt(next);
              const moved = new Date(next);
              if (!Number.isNaN(moved.getTime()) && length > 0) setEndsAt(toLocalInput(new Date(moved.getTime() + length)));
            }}
          />
        </Field>
        <Field>
          <Label htmlFor="meeting-end">Ends</Label>
          <Input id="meeting-end" type="datetime-local" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label htmlFor="meeting-description">Description (optional)</Label>
        <Textarea id="meeting-description" value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Invite people</legend>
        {people.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-[15px] text-muted-foreground">No one else is in this workspace yet.</p>
        ) : (
          <ul className="scrollbar-soft max-h-52 overflow-y-auto rounded-lg bg-muted/60">
            {people.map((p) => {
              const on = invitees.includes(p.userId);
              return (
                <li key={p.userId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setInvitees((cur) => (on ? cur.filter((id) => id !== p.userId) : [...cur, p.userId]))}
                    className="pressable flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                  >
                    <Avatar name={p.name} src={p.imageUrl} size="sm" presence={online.has(p.userId) ? "ONLINE" : "OFFLINE"} />
                    <span className="flex-1 truncate text-[15px] font-medium">{p.name}</span>
                    {on ? <Check className="size-5 text-primary" aria-label="Invited" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg bg-muted px-4 py-3")}>
        <input type="checkbox" checked={lobby} onChange={(e) => setLobby(e.target.checked)} className="size-5 accent-[var(--primary)]" />
        <span className="flex-1">
          <span className="block text-[15px] font-medium">Lobby</span>
          <span className="text-sm text-muted-foreground">People who were not invited wait until you let them in.</span>
        </span>
      </label>

      <FieldError>{error}</FieldError>
      <Button size="lg" disabled={pending || !title.trim()} onClick={submit}>
        {pending ? "Scheduling…" : "Schedule meeting"}
      </Button>
    </div>
  );
}
