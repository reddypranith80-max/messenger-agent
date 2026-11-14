import { auth } from "@clerk/nextjs/server";
import { CAN_ENTER, ChatError, getChannelForUser, joinDecision, joinWindow } from "@orbit/db";
import { z } from "zod";
import { requireWorkspace } from "@/server/context";
import { livekitConfig, mintToken, roomName } from "@/server/livekit";

export const dynamic = "force-dynamic";

const body = z.object({ slug: z.string().min(1).max(80), kind: z.enum(["channel", "meeting"]), id: z.string().min(1).max(64) });
const reply = (data: Record<string, unknown>, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

/**
 * Issues a LiveKit access token, only after proving the caller may be in this
 * room: a member of the conversation, or someone the meeting lets in.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return reply({ error: "unauthorized" }, 401);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "bad_request" }, 400);
  const config = livekitConfig();
  if (!config) return reply({ error: "not_configured" }, 503);

  const { user, workspace, membership, db } = await requireWorkspace(parsed.data.slug);
  const actor = { userId: user.id, role: membership.role };
  const { kind, id } = parsed.data;

  if (kind === "channel") {
    try {
      await getChannelForUser(db, id, user.id);
    } catch (error) {
      if (error instanceof ChatError) return reply({ error: "forbidden" }, 403);
      throw error;
    }
  } else {
    const { meeting, decision } = await joinDecision(db, actor, id);
    if (!meeting) return reply({ error: "forbidden" }, 403);
    if (!CAN_ENTER.has(decision)) return reply({ error: decision }, 403);
    if (decision !== "host") {
      const window = joinWindow(meeting);
      if (window !== "open") return reply({ error: window, startsAt: meeting.startsAt.toISOString() }, 403);
    }
  }

  const token = await mintToken(config, { room: roomName(workspace.id, kind, id), identity: user.id, name: user.name });
  return reply({ token, url: config.url });
}
