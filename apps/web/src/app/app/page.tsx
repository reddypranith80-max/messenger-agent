import { redirect } from "next/navigation";
import { requireUser } from "@/server/context";
import { syncMembershipsForUser } from "@/server/sync";

export const dynamic = "force-dynamic";

/** Post-sign-in entry point: mirror Clerk memberships, then go to a workspace or onboarding. */
export default async function AppEntry() {
  const user = await requireUser();
  const workspaces = await syncMembershipsForUser(user);
  const first = workspaces[0];
  redirect(first ? `/w/${first.slug}/chat` : "/onboarding");
}
