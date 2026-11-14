import { emailConfigured, escapeHtml, getPrisma, sendEmail } from "@orbit/db";
import { userRoom, type RealtimeServer } from "./server";

const LEAD_MS = 10 * 60_000;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Tell hosts and invitees that a meeting starts within ten minutes, in the app
 * and by email when Resend is configured. This is a background job across all
 * workspaces, so it uses the unscoped client on purpose; each reminder is only
 * ever sent to that meeting's own host and invitees. Claiming the meeting with
 * an atomic update makes it safe to run on several instances.
 */
export async function sendDueReminders(io: RealtimeServer): Promise<number> {
  const prisma = getPrisma();
  const now = Date.now();
  const due = await prisma.meeting.findMany({
    where: { cancelledAt: null, reminderSentAt: null, startsAt: { gt: new Date(now - 5 * 60_000), lte: new Date(now + LEAD_MS) } },
    include: { host: true, invitees: { include: { user: true } } },
    take: 100,
  });

  let sent = 0;
  for (const meeting of due) {
    const claimed = await prisma.meeting.updateMany({ where: { id: meeting.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
    if (claimed.count === 0) continue;
    sent++;
    const people = [meeting.host, ...meeting.invitees.map((i) => i.user)];
    const link = `${appUrl()}/join/${meeting.code}`;
    const when = new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(meeting.startsAt) + " UTC";
    for (const person of people) {
      io.to(userRoom(meeting.workspaceId, person.id)).emit("meeting:reminder", {
        meetingId: meeting.id,
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
      });
    }
    if (emailConfigured()) {
      await Promise.all(
        people.map((person) =>
          sendEmail({
            to: person.email,
            subject: `Starting soon: ${meeting.title}`,
            text: `${meeting.title} starts at ${when}.\nJoin: ${link}`,
            html: `<p><strong>${escapeHtml(meeting.title)}</strong> starts at ${escapeHtml(when)}.</p><p><a href="${escapeHtml(link)}">Join the meeting</a></p>`,
          }),
        ),
      );
    }
  }
  return sent;
}
