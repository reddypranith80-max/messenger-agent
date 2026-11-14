# Orbit

**Source code: <https://github.com/reddypranith80-max/messenger-agent>**

Team messenger and meetings SaaS. The product brief, stack and build phases are in [CLAUDE.md](CLAUDE.md).

**Status: phases 1 to 4 of 8, plus the in-app half of phase 5.**

| Area | State |
| --- | --- |
| Accounts, workspaces, roles, invitations | Working. Rename, leave and delete a workspace from Settings. |
| Chat | Working: channels, direct and group messages, threads, reactions, mentions, edit and delete, typing, read receipts, unread counts, message search. |
| Calls | Working once LiveKit keys are set (see below): 1:1 and group audio/video, screen share, device picker, in-call chat, raise hand, call history. |
| Meetings | Working: schedule, invite, join link, lobby, calendar. Email invitations and reminders go out once a Resend key is set. |
| Activity | Working in the app: mentions, replies and invitations, with a live banner and an unread badge. |
| Not built yet | File attachments, browser push and email digest, recording, calendar sync, webhooks and API tokens, billing, audit log. |

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js app (App Router): pages, server actions, Clerk webhook |
| `apps/realtime` | Socket.IO service: authenticated, workspace-scoped sockets and presence |
| `packages/db` | Prisma schema and migrations, tenant-scoped client, roles and permissions |
| `packages/ui` | Design system: tokens, cards, buttons, sheet, large-title scroll pane, motion |

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer, [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`),
Git, and a free [Clerk](https://dashboard.clerk.com) account.

1. Get the code and install dependencies:

   ```sh
   git clone https://github.com/reddypranith80-max/messenger-agent.git
   cd messenger-agent
   pnpm install
   ```

2. Create your environment file (`copy .env.example .env` on Windows Command Prompt):

   ```sh
   cp .env.example .env
   ```

3. Start a local database in its own terminal and leave it running. It needs no Docker. Copy the
   `postgres://...` URL it prints into `DATABASE_URL` in `.env`:

   ```sh
   pnpm db:dev
   ```

4. In the Clerk dashboard create an application, then copy its publishable key and secret key into
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env`. Apply the settings under
   [Clerk settings](#clerk-settings) below.

5. Create the tables, then start the app:

   ```sh
   pnpm db:deploy
   pnpm dev
   ```

6. Open <http://localhost:3000>, sign up, and create a workspace. The realtime service runs on port 4000.

Minimum `.env` to run the app:

- `DATABASE_URL`: the URL printed by `pnpm db:dev`, or a Neon/Supabase connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: from the Clerk dashboard (API keys). The app
  returns an error on every page until these are set.

Needed for specific features. Without them the rest of the app still works and the feature says what is missing:

- **Calls and meeting rooms**: `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Create a free project at
  <https://cloud.livekit.io>, open its Settings → Keys, and copy the three values. Restart `pnpm dev` afterwards.
- **Meeting emails** (invitations and the ten-minute reminder): `RESEND_API_KEY` and `EMAIL_FROM` from
  <https://resend.com>. Without them, invitees still see the meeting and its reminder inside the app.
- **More than one realtime instance**: `REDIS_URL`. A single local instance does not need it.

The R2 and Stripe variables in `.env.example` belong to features that are not built yet and can stay as placeholders.

### Clerk settings

In the Clerk dashboard for the application:

1. **Organizations**: enable, and turn off "force organization selection" (membership optional). A Clerk
   organization is an Orbit workspace, and Orbit has its own onboarding screen for creating one.
2. **Email**: require email address with verification code at sign-up (the default), and enable password reset.
3. **Multi-factor**: enable authenticator app and/or SMS so users can turn on 2FA.
4. **Webhooks** (optional locally, required in production): endpoint `<app url>/api/webhooks/clerk` with events
   `user.*`, `organization.*`, `organizationMembership.*`; put the signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`.
   Without the webhook, memberships still sync when a user opens `/app`.

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Run web and realtime together |
| `pnpm test` | All tests (permissions, tenant isolation against Postgres, realtime isolation) |
| `pnpm typecheck` / `pnpm lint` | Type and lint checks |
| `pnpm db:migrate` | Create and apply a migration after editing `schema.prisma` |
| `pnpm db:deploy` | Apply existing migrations (CI, production) |
| `pnpm build` | Production build |

## How tenant isolation works

- Every workspace-owned table has a `workspaceId` column and is listed in `TENANT_MODELS`
  (`packages/db/src/tenant.ts`). A test fails if a model with `workspaceId` is missing from that list.
- Application code reaches those tables only through `tenantDb(workspaceId)`, which adds the workspace filter to
  every read, update and delete, stamps it on every create, and refuses to move a row to another workspace.
- `requireWorkspace(slug)` (`apps/web/src/server/context.ts`) resolves the workspace from the URL, proves the
  signed-in user is a member, and hands back the scoped client. Non-members get a 404.
- The realtime service verifies the Clerk token and the membership at connect time and derives room names from
  that identity, never from client input. Every 30 seconds it disconnects sockets whose membership has ended.
- Chat, meeting, call-history, activity and search functions (`packages/db/src/chat.ts`, `meetings.ts`,
  `activity.ts`) take the scoped client and check the acting user themselves: you only ever get conversations
  you are in and meetings you host or are invited to.
- A LiveKit token is issued only after the same checks, for a room named after the workspace and the
  conversation or meeting, so a token for one tenant's room cannot be minted through another tenant.

## Roles

Owner, Admin, Member, Guest. The matrix lives in `packages/db/src/permissions.ts`. Clerk only knows admin and
member, so Orbit's database is the source of truth for roles: the organization's creator is the Owner, and Guest
is an Orbit role stored on the membership.
