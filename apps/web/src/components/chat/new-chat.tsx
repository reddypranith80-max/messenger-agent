"use client";

import { Avatar, Button, Field, FieldError, Input, Label, cn } from "@orbit/ui";
import type { BrowsableChannelDTO, ChannelDTO } from "@orbit/db/chat-types";
import { Check, Hash, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browseChannels } from "@/server/chat-actions";
import { useRealtime } from "./realtime-provider";

type Mode = "message" | "channel" | "browse";
const TABS: { mode: Mode; label: string }[] = [
  { mode: "message", label: "Message" },
  { mode: "channel", label: "Channel" },
  { mode: "browse", label: "Browse" },
];

/** Body of the "new" sheet: start a conversation, create a channel, or join one. */
export function NewChat({ onDone, canCreate }: { onDone: () => void; canCreate: boolean }) {
  const [mode, setMode] = useState<Mode>("message");
  const tabs = canCreate ? TABS : TABS.slice(0, 1);
  return (
    <div className="flex flex-col gap-5">
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="New" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {tabs.map((t) => (
            <button
              key={t.mode}
              type="button"
              role="tab"
              aria-selected={mode === t.mode}
              onClick={() => setMode(t.mode)}
              className={cn("pressable h-10 rounded-full text-sm font-semibold", mode === t.mode ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "message" ? <StartMessage onDone={onDone} /> : mode === "channel" ? <CreateChannel onDone={onDone} /> : <Browse onDone={onDone} />}
    </div>
  );
}

export function usePick() {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return { picked, toggle };
}

export function PeoplePicker({ picked, toggle, empty }: { picked: string[]; toggle: (id: string) => void; empty: string }) {
  const { people, online } = useRealtime();
  const [query, setQuery] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  if (people.length === 0) return <p className="rounded-lg bg-muted p-4 text-[15px] text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Search people" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="scrollbar-soft max-h-64 overflow-y-auto rounded-lg bg-muted/60">
        {shown.map((p) => {
          const on = picked.includes(p.userId);
          return (
            <li key={p.userId}>
              <button type="button" aria-pressed={on} onClick={() => toggle(p.userId)} className="pressable flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                <Avatar name={p.name} src={p.imageUrl} size="sm" presence={online.has(p.userId) ? "ONLINE" : "OFFLINE"} />
                <span className="flex-1 truncate text-[15px] font-medium">{p.name}</span>
                {on ? <Check className="size-5 text-primary" aria-label="Selected" /> : null}
              </button>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="px-3 py-3 text-sm text-muted-foreground">No one matches.</li> : null}
      </ul>
    </div>
  );
}

function useOpen(onDone: () => void) {
  const router = useRouter();
  const { slug } = useRealtime();
  return (channel: ChannelDTO) => {
    onDone();
    router.push(`/w/${slug}/chat/${channel.id}`);
  };
}

function StartMessage({ onDone }: { onDone: () => void }) {
  const { request } = useRealtime();
  const open = useOpen(onDone);
  const { picked, toggle } = usePick();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      open(await request<ChannelDTO>("dm:open", { userIds: picked }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the conversation.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PeoplePicker picked={picked} toggle={toggle} empty="No one else is in this workspace yet. Invite people from Settings → Members." />
      <FieldError>{error}</FieldError>
      <Button size="lg" disabled={busy || picked.length === 0} onClick={() => void start()}>
        {picked.length > 1 ? "Start group message" : "Start conversation"}
      </Button>
    </div>
  );
}

function CreateChannel({ onDone }: { onDone: () => void }) {
  const { request } = useRealtime();
  const open = useOpen(onDone);
  const { picked, toggle } = usePick();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      open(await request<ChannelDTO>("channel:create", { name, topic, isPrivate, memberIds: picked }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the channel.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <Label htmlFor="channel-name">Name</Label>
        <Input id="channel-name" placeholder="design-team" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <Label htmlFor="channel-topic">Topic (optional)</Label>
        <Input id="channel-topic" placeholder="What is this channel for?" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} />
      </Field>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted px-4 py-3">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} className="size-5 accent-[var(--primary)]" />
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-[15px] font-medium">
            <Lock className="size-4" /> Make private
          </span>
          <span className="text-sm text-muted-foreground">Only people you add can see it.</span>
        </span>
      </label>
      {isPrivate ? <PeoplePicker picked={picked} toggle={toggle} empty="No one else to add yet." /> : null}
      <FieldError>{error}</FieldError>
      <Button size="lg" disabled={busy || !name.trim()} onClick={() => void create()}>
        Create channel
      </Button>
    </div>
  );
}

function Browse({ onDone }: { onDone: () => void }) {
  const { request, slug } = useRealtime();
  const open = useOpen(onDone);
  const [channels, setChannels] = useState<BrowsableChannelDTO[] | null>(null);
  const [error, setError] = useState<string>();
  const [joining, setJoining] = useState<string>();

  useEffect(() => {
    let live = true;
    browseChannels(slug).then(
      (list) => live && setChannels(list),
      () => live && setError("Could not load channels."),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  const join = async (id: string) => {
    setJoining(id);
    setError(undefined);
    try {
      open(await request<ChannelDTO>("channel:join", { channelId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join.");
      setJoining(undefined);
    }
  };

  if (!channels && !error) return <p className="text-[15px] text-muted-foreground">Loading channels…</p>;
  return (
    <div className="flex flex-col gap-3">
      {channels?.length === 0 ? <p className="rounded-lg bg-muted p-4 text-[15px] text-muted-foreground">You have joined every public channel.</p> : null}
      <ul className="flex flex-col gap-2">
        {channels?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-lg bg-muted/60 px-4 py-3">
            <Hash className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{c.name}</p>
              <p className="truncate text-sm text-muted-foreground">{c.topic ?? `${c.memberCount} members`}</p>
            </div>
            <Button size="sm" disabled={joining === c.id} onClick={() => void join(c.id)}>
              Join
            </Button>
          </li>
        ))}
      </ul>
      <FieldError>{error}</FieldError>
    </div>
  );
}
