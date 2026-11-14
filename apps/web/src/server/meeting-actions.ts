"use server";

import {
  ChatError,
  cancelMeeting,
  createMeeting,
  emailConfigured,
  escapeHtml,
  listWaiting,
  sendEmail,
  type MeetingPerson,
} from "@orbit/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "./context";

export type MeetingActionResult = { ok: true; id?: string; emailed?: number } | { ok: false; error: string };

const slugSchema = z.string().min(1).max(80);
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function fail(error: unknown, fallback: string): MeetingActionResult {
  if (error instanceof ChatError) return { ok: false, error: error.message };
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? fallback };
  console.error(error);
  return { ok: false, error: fallback };
}

const scheduleSchema = z.object({
  title: z.string().trim().min(1, "Give the meeting a title.").max(120, "Keep the title under 120 characters."),
  description: z.string().max(2000).optional(),
  startsAt: z.iso.datetime({ message: "Pick a valid start time." }),
  endsAt: z.iso.datetime({ message: "Pick a valid end time." }),
  inviteeIds: z.array(z.string().min(1).max(64)).max(200),
  lobbyEnabled: z.boolean(),
});

export async function scheduleMeeting(slug: string, input: z.input<typeof scheduleSchema>): Promise<MeetingActionResult> {
  const { user, membership, db, workspace } = await requireWorkspace(slugSchema.parse(slug));
  try {
    const data = scheduleSchema.parse(input);
    const meeting = await createMeeting(db, { userId: user.id, role: membership.role }, data);

    // Invitation emails go out only when Resend is configured; invitees see the meeting in the app either way.
    let emailed = 0;
    if (emailConfigured() && meeting.invitees.length) {
      const people = await db.membership.findMany({ where: { userId: { in: meeting.invitees.map((i) => i.userId) } }, include: { user: true } });
      const when = new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(new Date(meeting.startsAt)) + " UTC";
      const link = `${appUrl()}/join/${meeting.code}`;
      const results = await Promise.all(
        people.map(({ user: invitee }) =>
          sendEmail({
            to: invitee.email,
            subject: `Invitation: ${meeting.title}`,
            text: `${user.name} invited you to "${meeting.title}" in ${workspace.name}.\nWhen: ${when}\nJoin: ${link}`,
            html: `<p>${escapeHtml(user.name)} invited you to <strong>${escapeHtml(meeting.title)}</strong> in ${escapeHtml(workspace.name)}.</p><p>${escapeHtml(when)}</p><p><a href="${escapeHtml(link)}">Join the meeting</a></p>`,
          }),
        ),
      );
      emailed = results.filter(Boolean).length;
    }
    revalidatePath(`/w/${slug}/meetings`, "layout");
    return { ok: true, id: meeting.id, emailed };
  } catch (error) {
    return fail(error, "Could not schedule the meeting.");
  }
}

export async function cancelMeetingAction(slug: string, id: string): Promise<MeetingActionResult> {
  const { user, membership, db } = await requireWorkspace(slugSchema.parse(slug));
  try {
    await cancelMeeting(db, { userId: user.id, role: membership.role }, z.string().min(1).max(64).parse(id));
    revalidatePath(`/w/${slug}/meetings`, "layout");
    return { ok: true };
  } catch (error) {
    return fail(error, "Could not cancel the meeting.");
  }
}

export async function fetchWaiting(slug: string, meetingId: string): Promise<MeetingPerson[]> {
  const { user, membership, db } = await requireWorkspace(slugSchema.parse(slug));
  return listWaiting(db, { userId: user.id, role: membership.role }, z.string().min(1).max(64).parse(meetingId)).catch(() => []);
}
