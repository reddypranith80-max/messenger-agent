"use client";

import { ActivePill, cn } from "@orbit/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const noop = () => () => {};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render no selection on the server.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const current = mounted ? theme : undefined;

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "pressable relative isolate flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected ? <ActivePill layoutId="theme-pill" className="rounded-full bg-card shadow-card" /> : null}
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
