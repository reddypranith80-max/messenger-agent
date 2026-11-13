import { cn } from "../lib/cn";

export type Presence = "ONLINE" | "AWAY" | "BUSY" | "OFFLINE";

export const PRESENCE_LABEL: Record<Presence, string> = {
  ONLINE: "Online",
  AWAY: "Away",
  BUSY: "Do not disturb",
  OFFLINE: "Offline",
};

const presenceColor: Record<Presence, string> = {
  ONLINE: "bg-success",
  AWAY: "bg-warning",
  BUSY: "bg-destructive",
  OFFLINE: "bg-muted-foreground/50",
};

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function PresenceDot({ presence, className }: { presence: Presence; className?: string }) {
  return (
    <span
      role="img"
      aria-label={PRESENCE_LABEL[presence]}
      className={cn("block size-3 rounded-full ring-2 ring-card", presenceColor[presence], className)}
    />
  );
}

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  /** Square with rounded corners, for workspaces. */
  shape?: "circle" | "rounded";
  presence?: Presence;
  className?: string;
};

export function Avatar({ name, src, size = "md", shape = "circle", presence, className }: AvatarProps) {
  const radius = shape === "circle" ? "rounded-full" : "rounded-[30%]";
  return (
    <span className={cn("relative inline-flex shrink-0", sizes[size], className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary hosts
        <img src={src} alt="" className={cn("size-full object-cover", radius)} />
      ) : (
        <span
          aria-hidden
          className={cn("flex size-full items-center justify-center bg-secondary font-semibold text-secondary-foreground", radius)}
        >
          {initials(name)}
        </span>
      )}
      {presence ? <PresenceDot presence={presence} className="absolute -right-0.5 -bottom-0.5" /> : null}
    </span>
  );
}
