"use client";

import { Button, cn } from "@orbit/ui";
import { MAX_MESSAGE_LENGTH } from "@orbit/db/chat-types";
import { SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type Mentionable = { userId: string; name: string };

type Props = {
  placeholder: string;
  members: Mentionable[];
  /** Resolve when sent; reject with an Error whose message is shown to the user. */
  onSend: (body: string) => Promise<void>;
  onTyping?: (on: boolean) => void;
  autoFocus?: boolean;
  disabled?: boolean;
};

const MENTION = /(^|\s)@([^\s@]{0,30})$/;

export function Composer({ placeholder, members, onSend, onTyping, autoFocus, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [highlightState, setHighlightState] = useState({ key: "", index: 0 });
  const lastTyping = useRef(0);

  const mention = useMemo(() => {
    const match = MENTION.exec(value.slice(0, caret));
    return match ? { query: match[2] ?? "", start: caret - (match[2]?.length ?? 0) - 1 } : null;
  }, [value, caret]);

  const options = useMemo(() => {
    if (!mention || dismissed === `${mention.start}`) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(q)) || m.name.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, members, dismissed]);

  // The highlighted row resets whenever the list of suggestions changes.
  const listKey = `${mention?.query ?? ""}|${options.length}`;
  const highlight = highlightState.key === listKey ? highlightState.index : 0;
  const setHighlight = (update: (current: number) => number) =>
    setHighlightState({ key: listKey, index: update(highlight) });

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);
  useEffect(resize, [value, resize]);

  const pick = (m: Mentionable) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const insert = `@${m.name} `;
    const next = before + insert + after;
    setValue(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const send = async () => {
    const body = value.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setError(undefined);
    try {
      await onSend(body);
      setValue("");
      onTyping?.(false);
      lastTyping.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (options.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const choice = options[highlight];
        if (choice) pick(choice);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (mention) setDismissed(`${mention.start}`);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="relative px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {options.length ? (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute right-3 bottom-full left-3 z-10 mb-1 overflow-hidden rounded-2xl bg-popover p-1 shadow-float"
        >
          {options.map((m, i) => (
            <li key={m.userId} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={cn("flex w-full items-center rounded-xl px-3 py-2 text-left text-[15px]", i === highlight && "bg-secondary text-secondary-foreground")}
              >
                @{m.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="px-3 pb-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2 rounded-[26px] bg-input p-1.5 pl-4 focus-within:ring-4 focus-within:ring-ring/15">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Message"
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart);
            setDismissed(null);
            const now = Date.now();
            if (onTyping && e.target.value && now - lastTyping.current > 2500) {
              lastTyping.current = now;
              onTyping(true);
            }
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => onTyping?.(false)}
          className="max-h-40 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/80"
        />
        <Button
          size="icon"
          aria-label="Send message"
          disabled={!value.trim() || sending || disabled}
          onClick={() => void send()}
          className="size-10"
        >
          <SendHorizontal />
        </Button>
      </div>
    </div>
  );
}
