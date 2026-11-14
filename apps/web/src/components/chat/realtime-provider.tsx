"use client";

import { useAuth } from "@clerk/nextjs";
import type { Ack, ChannelDTO, ClientToServerEvents, ServerToClientEvents } from "@orbit/db/chat-types";
import { io, type Socket } from "socket.io-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { refreshWorkspace } from "@/server/chat-actions";

export type Person = { userId: string; name: string; imageUrl: string | null };
export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type Status = "connecting" | "online" | "offline";

type Ctx = {
  slug: string;
  me: string;
  socket: ChatSocket | null;
  status: Status;
  channels: ChannelDTO[];
  people: Person[];
  online: ReadonlySet<string>;
  totalUnread: number;
  /** Mentions, replies and invitations the user has not looked at yet. */
  activityUnread: number;
  clearActivity: () => void;
  /** The conversation currently on screen; its messages count as read. */
  setActiveChannel: (id: string | null) => void;
  /** Emit an event and wait for the server's acknowledgement. */
  request: <T>(event: keyof ClientToServerEvents, payload: unknown) => Promise<T>;
};

const RealtimeContext = createContext<Ctx | null>(null);

export function useRealtime(): Ctx {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

/** Same hook for components (such as the app shell) that can render outside a workspace. */
export function useOptionalRealtime(): Ctx | null {
  return useContext(RealtimeContext);
}

type Props = {
  slug: string;
  workspaceId: string;
  me: string;
  url: string;
  initialChannels: ChannelDTO[];
  people: Person[];
  initialActivity?: number;
  children: ReactNode;
};

const byRecent = (a: ChannelDTO, b: ChannelDTO) => b.lastMessageAt.localeCompare(a.lastMessageAt);

export function RealtimeProvider({ slug, workspaceId, me, url, initialChannels, people: initialPeople, initialActivity = 0, children }: Props) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [socket, setSocket] = useState<ChatSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [channels, setChannels] = useState<ChannelDTO[]>(() => [...initialChannels].sort(byRecent));
  const [people, setPeople] = useState(initialPeople);
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());
  const knownRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    knownRef.current = new Set(people.map((p) => p.userId));
  }, [people]);
  const [activityUnread, setActivityUnread] = useState(initialActivity);
  const activeRef = useRef<string | null>(null);

  const upsertChannel = useCallback((channel: ChannelDTO) => {
    setChannels((current) => [channel, ...current.filter((c) => c.id !== channel.id)].sort(byRecent));
  }, []);

  useEffect(() => {
    // A fresh token is fetched on every (re)connect: Clerk session tokens are short-lived.
    const s: ChatSocket = io(url, {
      transports: ["websocket"],
      auth: (cb) => {
        getTokenRef.current().then(
          (token) => cb({ token: token ?? "", workspaceId }),
          () => cb({ token: "", workspaceId }),
        );
      },
    });
    let connectedBefore = false;
    // Conversations and people as the server has them now.
    const catchUp = () =>
      refreshWorkspace(slug).then(
        (fresh) => {
          setChannels(fresh.channels.sort(byRecent));
          setPeople(fresh.people);
        },
        () => {},
      );

    s.on("connect", () => {
      setStatus("online");
      // Catch up on anything missed while disconnected.
      if (connectedBefore) void catchUp();
      connectedBefore = true;
    });
    // Socket.IO retries by itself after a network drop, but not when the server closes the connection
    // or refuses the handshake. Retry those too, except when the answer is final (no longer a member).
    let retry: ReturnType<typeof setTimeout> | undefined;
    const reconnectIn = (ms: number) => {
      clearTimeout(retry);
      retry = setTimeout(() => s.connect(), ms);
    };
    s.on("disconnect", (reason) => {
      setStatus("offline");
      if (reason === "io server disconnect") reconnectIn(3000);
    });
    s.on("connect_error", (error) => {
      setStatus("offline");
      if (!s.active && error.message !== "forbidden" && error.message !== "bad_request") reconnectIn(5000);
    });

    s.on("presence:sync", ({ online: ids }) => setOnline(new Set(ids)));
    s.on("presence:joined", ({ userId }) => {
      setOnline((cur) => new Set(cur).add(userId));
      // Someone this tab has never heard of: a teammate who joined the workspace after the page loaded.
      // Fetch them, and the channels they were just added to, so they can be mentioned, messaged and seen.
      if (userId !== me && !knownRef.current.has(userId)) void catchUp();
    });
    s.on("presence:left", ({ userId }) =>
      setOnline((cur) => {
        const next = new Set(cur);
        next.delete(userId);
        return next;
      }),
    );

    s.on("channel:added", upsertChannel);
    s.on("activity:new", () => setActivityUnread((n) => n + 1));
    s.on("message:new", (message) => {
      setChannels((current) =>
        current
          .map((c) =>
            c.id !== message.channelId
              ? c
              : {
                  ...c,
                  lastMessageAt: message.createdAt,
                  unread: message.authorId !== me && activeRef.current !== c.id ? c.unread + 1 : c.unread,
                },
          )
          .sort(byRecent),
      );
    });
    s.on("read:updated", ({ channelId, userId, lastReadAt }) => {
      setChannels((current) =>
        current.map((c) =>
          c.id !== channelId
            ? c
            : {
                ...c,
                unread: userId === me ? 0 : c.unread,
                members: c.members.map((m) => (m.userId === userId ? { ...m, lastReadAt } : m)),
              },
        ),
      );
    });

    setSocket(s);
    return () => {
      clearTimeout(retry);
      s.close();
      setSocket(null);
    };
  }, [url, workspaceId, slug, me, upsertChannel]);

  const setActiveChannel = useCallback((id: string | null) => {
    activeRef.current = id;
    if (id) setChannels((current) => current.map((c) => (c.id === id && c.unread ? { ...c, unread: 0 } : c)));
  }, []);

  const clearActivity = useCallback(() => setActivityUnread(0), []);

  const request = useCallback(
    <T,>(event: keyof ClientToServerEvents, payload: unknown): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        if (!socket || !socket.connected) {
          reject(new Error("You are offline. Reconnecting…"));
          return;
        }
        const emitter = socket.timeout(10_000) as unknown as {
          emit: (event: string, payload: unknown, done: (error: Error | null, result: Ack<T>) => void) => void;
        };
        emitter.emit(event, payload, (error, result) => {
          if (error) reject(new Error("The server took too long to respond. Try again."));
          else if (result.ok) resolve(result.data);
          else reject(new Error(result.error));
        });
      }),
    [socket],
  );

  const totalUnread = useMemo(() => channels.reduce((sum, c) => sum + c.unread, 0), [channels]);
  const value = useMemo<Ctx>(
    () => ({ slug, me, socket, status, channels, people, online, totalUnread, activityUnread, clearActivity, setActiveChannel, request }),
    [slug, me, socket, status, channels, people, online, totalUnread, activityUnread, clearActivity, setActiveChannel, request],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
