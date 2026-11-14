/** Meeting types shared by the web app and the realtime service. No database imports. */

export type MeetingPerson = { userId: string; name: string; imageUrl: string | null };

export type MeetingDTO = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  /** Used in the join link: /join/<code>. */
  code: string;
  lobbyEnabled: boolean;
  cancelled: boolean;
  host: MeetingPerson;
  invitees: MeetingPerson[];
};

/** How a person gets into a meeting right now. */
export type JoinDecision =
  | "host"
  | "invited"
  | "open" // the lobby is off
  | "admitted" // the host let them in
  | "waiting" // knocked; the host has not answered
  | "denied"
  | "knock" // not invited, lobby on, has not knocked yet
  | "forbidden"; // guests who are not invited, or the meeting does not exist for them

export const CAN_ENTER: ReadonlySet<JoinDecision> = new Set(["host", "invited", "open", "admitted"]);

/** People may join from this long before the start until this long after the end. */
export const JOIN_EARLY_MS = 15 * 60_000;
export const JOIN_LATE_MS = 60 * 60_000;

export function joinWindow(meeting: { startsAt: string | Date; endsAt: string | Date }, now = Date.now()): "early" | "open" | "ended" {
  const start = new Date(meeting.startsAt).getTime();
  const end = new Date(meeting.endsAt).getTime();
  if (now < start - JOIN_EARLY_MS) return "early";
  if (now > end + JOIN_LATE_MS) return "ended";
  return "open";
}
