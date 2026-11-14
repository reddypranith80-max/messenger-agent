"use client";

import { Avatar, Button, Sheet, cn } from "@orbit/ui";
import { QUICK_REACTIONS, type MessageDTO } from "@orbit/db/chat-types";
import { Copy, Ellipsis, MessageSquareReply, Pencil, Trash2 } from "lucide-react";
import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import { LocalTime } from "@/components/local-time";

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** Message text with links and @mentions of known people highlighted. */
export function renderBody(body: string, names: string[], meName: string): ReactNode[] {
  const escaped = [...new Set(names)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const mentionRe = escaped.length ? new RegExp(`(@(?:${escaped.join("|")}))(?![\\p{L}\\p{N}_])`, "giu") : null;

  const withMentions = (text: string, keyBase: string): ReactNode[] => {
    if (!mentionRe) return [text];
    return text.split(mentionRe).map((part, i) =>
      i % 2 === 1 ? (
        <span
          key={`${keyBase}-m${i}`}
          className={cn(
            "rounded-md px-1 font-medium",
            part.slice(1).toLowerCase() === meName.toLowerCase() ? "bg-warning/30 text-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          {part}
        </span>
      ) : (
        <Fragment key={`${keyBase}-t${i}`}>{part}</Fragment>
      ),
    );
  };

  return body.split(URL_RE).flatMap((part, i): ReactNode[] =>
    i % 2 === 1
      ? [
          <a key={`u${i}`} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2 break-all">
            {part}
          </a>,
        ]
      : withMentions(part, `p${i}`),
  );
}

export function formatDay(iso: string): string {
  const day = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "Today";
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(day);
}

const noop = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Anything that
 * depends on the viewer's time zone (which day a message falls on, what time
 * it shows) waits for this, because the server does not know that zone.
 */
export function useLocalClock(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function DaySeparator({ iso }: { iso: string }) {
  return (
    <div role="separator" className="flex items-center gap-3 px-4 pt-5 pb-1 text-xs font-semibold text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {formatDay(iso)}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** True when `message` should start a new visual group (the author changed, or 5 minutes passed). Day changes are the caller's job: they depend on the viewer's time zone. */
export function startsGroup(prev: MessageDTO | undefined, message: MessageDTO): boolean {
  if (!prev || prev.authorId !== message.authorId || prev.deleted !== message.deleted) return true;
  return new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
}

type ItemProps = {
  message: MessageDTO;
  me: string;
  names: string[];
  meName: string;
  showHeader: boolean;
  seen?: string | null;
  editing: boolean;
  onActions: (message: MessageDTO) => void;
  onReact: (message: MessageDTO, emoji: string) => void;
  onOpenThread?: (message: MessageDTO) => void;
  onEditSubmit: (body: string) => Promise<void>;
  onEditCancel: () => void;
};

export function MessageItem({
  message,
  me,
  names,
  meName,
  showHeader,
  seen,
  editing,
  onActions,
  onReact,
  onOpenThread,
  onEditSubmit,
  onEditCancel,
}: ItemProps) {
  const mentionsMe = message.mentionIds.includes(me);
  return (
    <div
      className={cn("group relative flex gap-3 px-4 py-0.5", showHeader && "pt-3", mentionsMe && "bg-warning/10")}
      data-message-id={message.id}
    >
      <div className="w-9 shrink-0 pt-0.5">
        {showHeader ? <Avatar name={message.author.name} src={message.author.imageUrl} size="sm" className="size-9" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{message.author.name}</span>
            <LocalTime iso={message.createdAt} format="time" className="text-xs text-muted-foreground" />
          </div>
        ) : null}

        {message.deleted ? (
          <p className="text-[15px] text-muted-foreground italic">This message was deleted.</p>
        ) : editing ? (
          <InlineEditor initial={message.body} onSubmit={onEditSubmit} onCancel={onEditCancel} />
        ) : (
          <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
            {renderBody(message.body, names, meName)}
            {message.editedAt ? <span className="ml-1.5 text-xs text-muted-foreground">(edited)</span> : null}
          </p>
        )}

        {message.reactions.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.reactions.map((r) => {
              const mine = r.userIds.includes(me);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  aria-pressed={mine}
                  aria-label={`${r.emoji} ${r.userIds.length} ${r.userIds.length === 1 ? "reaction" : "reactions"}`}
                  onClick={() => onReact(message, r.emoji)}
                  className={cn(
                    "pressable inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-sm",
                    mine ? "border-primary bg-secondary text-secondary-foreground" : "border-transparent bg-muted",
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-semibold">{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {onOpenThread && !message.deleted && message.replyCount > 0 ? (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="pressable mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground"
          >
            <MessageSquareReply className="size-4" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        ) : null}

        {seen ? <p className="mt-0.5 text-right text-xs text-muted-foreground">{seen}</p> : null}
      </div>

      {message.deleted ? null : (
        <button
          type="button"
          aria-label="Message actions"
          onClick={() => onActions(message)}
          className="pressable absolute top-1 right-2 flex size-8 items-center justify-center rounded-full bg-card/90 text-muted-foreground opacity-70 shadow-card hover:text-foreground md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Ellipsis className="size-[18px]" />
        </button>
      )}
    </div>
  );
}

function InlineEditor({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (body: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (value.trim() === initial) return onCancel();
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-2">
      <textarea
        autoFocus
        value={value}
        aria-label="Edit message"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        rows={Math.min(6, Math.max(2, value.split("\n").length))}
        className="w-full resize-none rounded-lg bg-input px-3 py-2 text-[15px] outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving || !value.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type ActionsProps = {
  message: MessageDTO | null;
  isMine: boolean;
  canModerate: boolean;
  onClose: () => void;
  onReact: (message: MessageDTO, emoji: string) => void;
  onReply?: (message: MessageDTO) => void;
  onEdit: (message: MessageDTO) => void;
  onDelete: (message: MessageDTO) => void;
  me: string;
};

export function MessageActionsSheet({ message, isMine, canModerate, onClose, onReact, onReply, onEdit, onDelete, me }: ActionsProps) {
  // Keep showing the last message while the sheet animates closed.
  const [kept, setKept] = useState(message);
  if (message && message !== kept) setKept(message);
  const shown = message ?? kept;

  return (
    <Sheet open={message !== null} onOpenChange={(open) => !open && onClose()} title="Message">
      {shown ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-8 gap-1" role="group" aria-label="React">
            {QUICK_REACTIONS.map((emoji) => {
              const active = shown.reactions.find((r) => r.emoji === emoji)?.userIds.includes(me);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  aria-pressed={Boolean(active)}
                  onClick={() => {
                    onReact(shown, emoji);
                    onClose();
                  }}
                  className={cn("pressable flex aspect-square items-center justify-center rounded-full text-xl", active ? "bg-secondary" : "hover:bg-muted")}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            {onReply ? (
              <Button variant="secondary" onClick={() => onReply(shown)}>
                <MessageSquareReply /> Reply in thread
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(shown.body);
                onClose();
              }}
            >
              <Copy /> Copy text
            </Button>
            {isMine ? (
              <Button variant="secondary" onClick={() => onEdit(shown)}>
                <Pencil /> Edit
              </Button>
            ) : null}
            {isMine || canModerate ? (
              <Button variant="destructive" onClick={() => onDelete(shown)}>
                <Trash2 /> Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
