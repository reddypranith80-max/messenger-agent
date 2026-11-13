# Project: Orbit — team messenger and meetings SaaS

## What it is
A multi-tenant web app for teams: chat, audio/video calls, scheduled meetings,
file sharing and integrations. Think Teams/Slack scope, not the full Office suite
(no document editors, no mail server).

## Stack (do not substitute without asking)
- Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- PostgreSQL + Prisma
- Auth: Clerk (email verification, password reset, 2FA, organizations = workspaces)
- Realtime chat: Socket.IO server (separate Node service) with Redis pub/sub
- Audio/video/screen share: LiveKit (cloud for dev, self-hostable later)
- Transactional email: Resend
- File storage: S3-compatible (Cloudflare R2), presigned uploads
- Billing: Stripe subscriptions (Free / Pro / Business, per seat)
- Monorepo with pnpm: apps/web, apps/realtime, packages/db, packages/ui

## Features
1. Accounts: sign up, email verification, login, 2FA, profile, presence status
2. Workspaces: create, invite by email, roles (owner, admin, member, guest)
3. Chat: channels (public/private), direct and group messages, threads, reactions,
   mentions, edit/delete, typing indicators, read receipts, unread counts,
   file and image attachments, message search
4. Calls: 1:1 and group audio/video, screen share, mute/camera controls,
   in-call chat, raise hand, device picker, call from any channel or DM
5. Meetings: schedule with title/time/invitees, join link, lobby, calendar view,
   email invite and reminder, optional recording
6. Notifications: in-app, browser push, email digest for missed messages
7. Integrations: Google and Microsoft calendar sync, incoming webhooks,
   a simple bot/API token system
8. Admin: member management, audit log, billing page, usage limits per plan
9. Security: row-level tenant isolation on every query, rate limiting,
   input validation with Zod, upload type/size limits

## Design language
"Soft box" UI inspired by modern phone interfaces (do not copy any brand's
assets, icons or names):
- Content sits in large rounded cards (24px radius) on a tinted background
- Big bold page titles at the top that shrink on scroll; main actions within
  thumb reach at the bottom on mobile
- Generous spacing, one accent colour, light and dark themes
- Fluid motion: spring transitions for page changes, sheets sliding up from
  the bottom, pressed states that scale slightly; respect reduced-motion
- Fully responsive: three-pane layout on desktop, single pane with bottom
  navigation on mobile

## Working rules
- Build one phase at a time; stop and summarise after each
- Every phase ends with: migrations applied, tests passing, app runs locally
- Put all secrets in .env.example with placeholder values; never hard-code keys
- Write tests for permissions and tenant isolation
- Ask before adding a paid service or a new dependency category

## Phases
1. Monorepo scaffold, schema for users/workspaces/memberships/roles, Clerk auth
   with email verification, app shell and design system with placeholder pages
2. Chat: channels, DMs, threads, reactions, mentions, typing, read receipts,
   unread counts via the realtime service; attachments via presigned uploads
3. LiveKit calls: 1:1 and group audio/video, screen share, device picker,
   in-call chat, starting a call from any conversation
4. Scheduled meetings: create, invite, join link, lobby, calendar view, email
   invites and reminders through Resend
5. Notifications (in-app, push, email digest) and message search
6. Integrations: Google and Microsoft calendar sync, incoming webhooks, API tokens
7. Stripe billing with plan limits, the admin area and audit log
8. Security and quality pass: tenant-isolation tests, rate limits, accessibility,
   loading and empty states, then a deployment guide
