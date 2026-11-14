"use server";

import {
  ChatError,
  listActivity,
  listBrowsableChannels,
  listChannelsForUser,
  listDirectory,
  listMessages,
  listThread,
  markActivitySeen,
  searchMessages,
  type ActivityItem,
  type BrowsableChannelDTO,
  type ChannelDTO,
  type MessageDTO,
} from "@orbit/db";
import { z } from "zod";
import { requireWorkspace } from "./context";

/** Reads for the chat UI. Writes go through the realtime service so everyone is updated live. */

const ids = z.object({ slug: z.string().min(1).max(80), channelId: z.string().min(1).max(64) });

function friendly(error: unknown): never {
  if (error instanceof ChatError) throw new Error(error.message);
  throw error;
}

export async function fetchMessages(slug: string, channelId: string, before?: string): Promise<{ messages: MessageDTO[]; hasMore: boolean }> {
  const input = ids.parse({ slug, channelId });
  const { user, db } = await requireWorkspace(input.slug);
  return listMessages(db, user.id, input.channelId, { before }).catch(friendly);
}

export async function fetchThread(
  slug: string,
  channelId: string,
  parentId: string,
): Promise<{ root: MessageDTO; replies: MessageDTO[] }> {
  const input = ids.parse({ slug, channelId });
  const { user, db } = await requireWorkspace(input.slug);
  return listThread(db, user.id, input.channelId, z.string().min(1).max(64).parse(parentId)).catch(friendly);
}

export async function refreshChannels(slug: string): Promise<ChannelDTO[]> {
  const { user, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  return listChannelsForUser(db, user.id);
}

/** Conversations and the people directory together, for a client that needs to catch up. */
export async function refreshWorkspace(slug: string): Promise<{ channels: ChannelDTO[]; people: { userId: string; name: string; imageUrl: string | null }[] }> {
  const { user, membership, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  const [channels, people] = await Promise.all([listChannelsForUser(db, user.id), listDirectory(db, { userId: user.id, role: membership.role })]);
  return { channels, people };
}

export async function browseChannels(slug: string): Promise<BrowsableChannelDTO[]> {
  const { user, membership, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  return listBrowsableChannels(db, user.id, membership.role);
}

export async function searchChat(slug: string, query: string): Promise<MessageDTO[]> {
  const { user, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  return searchMessages(db, user.id, z.string().max(100).parse(query)).catch(friendly);
}

export async function fetchActivity(slug: string): Promise<ActivityItem[]> {
  const { user, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  return listActivity(db, user.id);
}

/** The user has looked at their activity: everything up to now is no longer new. */
export async function markActivityRead(slug: string): Promise<void> {
  const { user, db } = await requireWorkspace(z.string().min(1).max(80).parse(slug));
  await markActivitySeen(db, user.id);
}
