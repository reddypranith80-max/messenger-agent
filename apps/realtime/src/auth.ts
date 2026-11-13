import { verifyToken } from "@clerk/backend";
import { prisma, tenantDb, type RoleName } from "@orbit/db";
import { z } from "zod";

export const handshakeSchema = z.object({
  /** Clerk session token (`await getToken()` in the browser). */
  token: z.string().min(1),
  /** Orbit workspace id the socket wants to join. */
  workspaceId: z.string().min(1).max(64),
});

export type SocketIdentity = { userId: string; workspaceId: string; role: RoleName; name: string };

export type Authenticator = (handshakeAuth: unknown) => Promise<SocketIdentity>;

export class HandshakeError extends Error {
  constructor(message: "unauthorized" | "forbidden" | "bad_request") {
    super(message);
    this.name = "HandshakeError";
  }
}

/**
 * Verify the Clerk session token and prove the user is a member of the
 * workspace they ask to join. A socket only ever enters rooms of that one
 * workspace, which is what keeps tenants apart on the realtime side.
 */
export const authenticate: Authenticator = async (handshakeAuth) => {
  const parsed = handshakeSchema.safeParse(handshakeAuth);
  if (!parsed.success) throw new HandshakeError("bad_request");

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not set for the realtime service.");

  let clerkId: string;
  try {
    const claims = await verifyToken(parsed.data.token, { secretKey });
    clerkId = claims.sub;
  } catch {
    throw new HandshakeError("unauthorized");
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) throw new HandshakeError("unauthorized");

  const membership = await tenantDb(parsed.data.workspaceId).membership.findFirst({ where: { userId: user.id } });
  if (!membership) throw new HandshakeError("forbidden");

  return { userId: user.id, workspaceId: membership.workspaceId, role: membership.role, name: user.name };
};
