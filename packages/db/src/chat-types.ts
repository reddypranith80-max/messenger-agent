/**
 * Chat types and constants shared by the web app, the realtime service and
 * the database layer. No database imports, so client components can use it.
 */

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👀"] as const;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_GROUP_SIZE = 9;

export type ChannelKindName = "CHANNEL" | "DM" | "GROUP";

export type ChannelMemberDTO = { userId: string; name: string; imageUrl: string | null; lastReadAt: string };

export type ChannelDTO = {
  id: string;
  kind: ChannelKindName;
  name: string | null;
  topic: string | null;
  isPrivate: boolean;
  lastMessageAt: string;
  /** Messages from other people after this user's last read time. */
  unread: number;
  members: ChannelMemberDTO[];
};

export type BrowsableChannelDTO = { id: string; name: string; topic: string | null; memberCount: number };

export type ReactionDTO = { emoji: string; userIds: string[] };

export type MessageDTO = {
  id: string;
  channelId: string;
  parentId: string | null;
  authorId: string;
  author: { id: string; name: string; imageUrl: string | null };
  /** Empty when deleted. */
  body: string;
  mentionIds: string[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  replyCount: number;
  reactions: ReactionDTO[];
};

export type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ServerToClientEvents {
  "message:new": (message: MessageDTO) => void;
  "message:updated": (message: MessageDTO) => void;
  "message:deleted": (payload: { channelId: string; id: string; parentId: string | null }) => void;
  "reaction:updated": (payload: { channelId: string; messageId: string; reactions: ReactionDTO[] }) => void;
  typing: (payload: { channelId: string; userId: string; name: string; on: boolean }) => void;
  "channel:added": (channel: ChannelDTO) => void;
  "read:updated": (payload: { channelId: string; userId: string; lastReadAt: string }) => void;
  "presence:sync": (payload: { online: string[] }) => void;
  "presence:joined": (payload: { userId: string; name: string }) => void;
  "presence:left": (payload: { userId: string }) => void;
  /** You were mentioned, or someone replied to your message (sent only to you). */
  "activity:new": (payload: { kind: "mention" | "reply"; channelId: string; messageId: string; actorName: string; text: string }) => void;
  /** Someone started a call in a conversation you are in. */
  "call:started": (payload: { channelId: string; userId: string; name: string }) => void;
  /** A person is waiting in a meeting's lobby (sent to the host). */
  "meeting:knock": (payload: { meetingId: string; userId: string; name: string }) => void;
  /** The host answered a knock (sent to the person who knocked). */
  "meeting:answered": (payload: { meetingId: string; admitted: boolean }) => void;
  /** A meeting you host or were invited to starts soon. */
  "meeting:reminder": (payload: { meetingId: string; title: string; startsAt: string }) => void;
}

export interface ClientToServerEvents {
  "message:send": (
    payload: { channelId: string; body: string; parentId?: string | null },
    ack: (result: Ack<MessageDTO>) => void,
  ) => void;
  "message:edit": (payload: { id: string; body: string }, ack: (result: Ack<MessageDTO>) => void) => void;
  "message:delete": (payload: { id: string }, ack: (result: Ack<{ id: string }>) => void) => void;
  "reaction:toggle": (
    payload: { messageId: string; emoji: string },
    ack: (result: Ack<ReactionDTO[]>) => void,
  ) => void;
  "channel:read": (payload: { channelId: string }, ack?: (result: Ack<{ lastReadAt: string }>) => void) => void;
  "channel:create": (
    payload: { name: string; topic?: string; isPrivate: boolean; memberIds: string[] },
    ack: (result: Ack<ChannelDTO>) => void,
  ) => void;
  "channel:join": (payload: { channelId: string }, ack: (result: Ack<ChannelDTO>) => void) => void;
  "dm:open": (payload: { userIds: string[] }, ack: (result: Ack<ChannelDTO>) => void) => void;
  typing: (payload: { channelId: string; on: boolean }) => void;
  "call:start": (payload: { channelId: string }, ack: (result: Ack<{ channelId: string }>) => void) => void;
  "meeting:knock": (payload: { meetingId: string }, ack: (result: Ack<{ decision: string }>) => void) => void;
  "meeting:decide": (
    payload: { meetingId: string; userId: string; admit: boolean },
    ack: (result: Ack<{ ok: true }>) => void,
  ) => void;
}

/** What a conversation is called for `me`. */
export function channelTitle(channel: Pick<ChannelDTO, "kind" | "name" | "members">, me: string): string {
  if (channel.kind === "CHANNEL") return channel.name ?? "channel";
  const others = channel.members.filter((m) => m.userId !== me);
  if (others.length === 0) return `${channel.members[0]?.name ?? "You"} (you)`;
  return others.map((m) => m.name).join(", ");
}

/** One entry in the call history: someone started a call in a conversation. */
export type CallDTO = {
  id: string;
  channelId: string;
  startedAt: string;
  startedBy: { id: string; name: string; imageUrl: string | null };
};

type ActivityActor = { id: string; name: string; imageUrl: string | null };

/** Something that happened to you: a mention, a reply to your message, or a meeting invitation. */
export type ActivityItem =
  | { kind: "mention" | "reply"; id: string; at: string; actor: ActivityActor; channelId: string; parentId: string | null; text: string }
  | { kind: "invite"; id: string; at: string; actor: ActivityActor; meetingId: string; title: string; startsAt: string };
