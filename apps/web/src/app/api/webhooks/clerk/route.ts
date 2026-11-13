import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { prisma } from "@orbit/db";
import type { NextRequest } from "next/server";
import {
  deleteMembership,
  deleteUserByClerkId,
  deleteWorkspaceByClerkOrgId,
  upsertMembership,
  upsertUser,
  upsertWorkspace,
} from "@/server/sync";

/**
 * Clerk → Orbit sync. Configure in the Clerk dashboard (Webhooks) with the
 * events user.*, organization.* and organizationMembership.*, and put the
 * signing secret in CLERK_WEBHOOK_SIGNING_SECRET.
 */
export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const u = event.data;
      const email =
        u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ??
        u.email_addresses[0]?.email_address;
      if (email) {
        await upsertUser({
          clerkId: u.id,
          email,
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "",
          imageUrl: u.has_image ? u.image_url : null,
        });
      }
      break;
    }
    case "user.deleted":
      if (event.data.id) await deleteUserByClerkId(event.data.id);
      break;

    case "organization.created":
    case "organization.updated": {
      const o = event.data;
      await upsertWorkspace({
        clerkOrgId: o.id,
        name: o.name,
        imageUrl: o.has_image ? o.image_url : null,
        createdBy: o.created_by,
      });
      break;
    }
    case "organization.deleted":
      if (event.data.id) await deleteWorkspaceByClerkOrgId(event.data.id);
      break;

    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const m = event.data;
      const person = m.public_user_data;
      const workspace = await upsertWorkspace({
        clerkOrgId: m.organization.id,
        name: m.organization.name,
        imageUrl: m.organization.has_image ? m.organization.image_url : null,
        createdBy: m.organization.created_by,
      });
      const user =
        (await prisma.user.findUnique({ where: { clerkId: person.user_id } })) ??
        (await upsertUser({
          clerkId: person.user_id,
          email: person.identifier,
          name: [person.first_name, person.last_name].filter(Boolean).join(" "),
          imageUrl: person.has_image ? person.image_url : null,
        }));
      await upsertMembership({
        workspace,
        user,
        clerkRole: m.role,
        clerkMembershipId: m.id,
        isCreator: m.organization.created_by === person.user_id,
      });
      break;
    }
    case "organizationMembership.deleted":
      await deleteMembership(event.data.organization.id, event.data.public_user_data.user_id);
      break;

    default:
      break; // Unhandled event types are acknowledged so Clerk does not retry.
  }

  return new Response(null, { status: 204 });
}
