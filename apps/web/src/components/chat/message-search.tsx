"use client";

import { Avatar, Card, Input, ListRow, RowList, SectionLabel } from "@orbit/ui";
import { channelTitle, type MessageDTO } from "@orbit/db/chat-types";
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocalTime } from "@/components/local-time";
import { searchChat } from "@/server/chat-actions";
import { useRealtime } from "./realtime-provider";

type State = { query: string; results: MessageDTO[] | null; error?: string };

/** Search box for the conversation list. Returns the results section, or null while the box is empty. */
export function useMessageSearch() {
  const { slug, me, channels } = useRealtime();
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ query: "", results: null });
  const latest = useRef(0);
  const query = text.trim();
  const active = query.length >= 2;

  useEffect(() => {
    if (!active) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      searchChat(slug, query).then(
        (results) => ticket === latest.current && setState({ query, results }),
        (e: unknown) => ticket === latest.current && setState({ query, results: [], error: e instanceof Error ? e.message : "Search failed." }),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [slug, query, active]);

  const box = (
    <div className="relative px-1">
      <Search className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label="Search messages" placeholder="Search messages" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} className="rounded-full bg-card pl-11 shadow-card" />
    </div>
  );

  if (!active) return { box, results: null };

  const loading = state.query !== query;
  const hits = loading ? [] : (state.results ?? []);
  const results = (
    <section aria-live="polite">
      <SectionLabel>{loading ? "Searching…" : `${hits.length} ${hits.length === 1 ? "result" : "results"}`}</SectionLabel>
      <Card>
        {state.error && !loading ? <p className="p-5 text-[15px] text-destructive">{state.error}</p> : null}
        {!loading && !state.error && hits.length === 0 ? <p className="p-5 text-[15px] text-muted-foreground">No messages match “{query}”.</p> : null}
        {loading ? <p className="p-5 text-[15px] text-muted-foreground">Searching your conversations…</p> : null}
        {hits.length ? (
          <RowList>
            {hits.map((m) => {
              const channel = channels.find((c) => c.id === m.channelId);
              const place = !channel ? "Conversation" : channel.kind === "CHANNEL" ? `#${channel.name}` : channelTitle(channel, me);
              return (
                <li key={m.id}>
                  <Link href={`/w/${slug}/chat/${m.channelId}`} className="pressable block hover:bg-muted">
                    <ListRow
                      leading={<Avatar name={m.author.name} src={m.author.imageUrl} />}
                      title={
                        <>
                          {m.author.name} <span className="font-normal text-muted-foreground">in {place}</span>
                        </>
                      }
                      subtitle={m.body}
                      trailing={<LocalTime iso={m.createdAt} format="short" className="text-xs" />}
                    />
                  </Link>
                </li>
              );
            })}
          </RowList>
        ) : null}
      </Card>
    </section>
  );
  return { box, results };
}
