/**
 * Transactional email through Resend's HTTP API. Without RESEND_API_KEY it
 * does nothing and reports that, so features work (in-app) before email is set up.
 */
export type EmailMessage = { to: string | string[]; subject: string; html: string; text: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "re_xxx");
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Returns true when Resend accepted the message. Never throws: email must not break the action that triggered it. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Orbit <onboarding@resend.dev>",
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("[email] Resend rejected the message:", response.status, await response.text().catch(() => ""));
    return response.ok;
  } catch (error) {
    console.error("[email] could not reach Resend:", (error as Error).message);
    return false;
  }
}
