"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

type Props = { iso: string; format?: "time" | "date" | "datetime" | "day" | "range" | "short"; endIso?: string; className?: string };

const FORMATS = {
  time: { hour: "numeric", minute: "2-digit" },
  date: { dateStyle: "medium" },
  datetime: { dateStyle: "full", timeStyle: "short" },
  day: { weekday: "long", month: "long", day: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Renders a time in the viewer's own time zone. The server does not know that
 * zone, so it renders nothing and the browser fills it in after hydration.
 */
export function LocalTime({ iso, format = "datetime", endIso, className }: Props) {
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!ready) return <span className={className}>{" "}</span>;
  const start = new Date(iso);
  let text: string;
  if (format === "range" && endIso) {
    const end = new Date(endIso);
    const day = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(start);
    const t = new Intl.DateTimeFormat("en", FORMATS.time);
    text = `${day}, ${t.format(start)} – ${t.format(end)}`;
  } else if (format === "short") {
    // Today shows the time, earlier days show the date.
    const today = localDayKey(start) === localDayKey(new Date());
    text = new Intl.DateTimeFormat("en", today ? FORMATS.time : { month: "short", day: "numeric" }).format(start);
  } else {
    text = new Intl.DateTimeFormat("en", FORMATS[format === "range" ? "datetime" : format]).format(start);
  }
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}

/** YYYY-MM-DD in the viewer's time zone, for grouping by day. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
