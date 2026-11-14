import type { PrismaClient } from "./generated/prisma/client";
import { prisma as defaultClient } from "./client";

/**
 * Models that carry a `workspaceId` column. Every model added in later phases
 * that belongs to a workspace MUST be listed here; `tenant.test.ts` fails if a
 * model with a workspaceId field is missing.
 */
export const TENANT_MODELS = [
  "Membership",
  "Invitation",
  "Channel",
  "ChannelMember",
  "Message",
  "Reaction",
  "Meeting",
  "MeetingInvitee",
  "MeetingAdmission",
  "Call",
] as const;
export type TenantModel = (typeof TENANT_MODELS)[number];

const TENANT_MODEL_SET: ReadonlySet<string> = new Set(TENANT_MODELS);

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

type Args = Record<string, unknown>;

const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
const UPDATE_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/**
 * Add the tenant filter without disturbing the caller's filter. Top-level
 * keys of a Prisma `where` are ANDed, so nothing the caller passes (including
 * OR) can widen the result beyond this workspace. Unique fields stay at the
 * top level, which findUnique/update/delete require.
 */
function scopeWhere(where: unknown, workspaceId: string): Args {
  const original = (where ?? {}) as Args;
  const and = original.AND === undefined ? [] : Array.isArray(original.AND) ? original.AND : [original.AND];
  return { ...original, AND: [...and, { workspaceId }] };
}

function stampCreate(model: string, data: unknown, workspaceId: string): Args {
  const row = { ...((data ?? {}) as Args) };
  if ("workspace" in row) {
    throw new TenantIsolationError(
      `${model}: workspaceId is set by tenantDb(); do not use the "workspace" relation.`,
    );
  }
  if (row.workspaceId !== undefined && row.workspaceId !== workspaceId) {
    throw new TenantIsolationError(`${model}: attempted to write a row for another workspace.`);
  }
  row.workspaceId = workspaceId;
  return row;
}

function guardUpdate(model: string, data: unknown, workspaceId: string): void {
  const row = (data ?? {}) as Args;
  if ("workspace" in row) {
    throw new TenantIsolationError(`${model}: rows cannot be moved between workspaces.`);
  }
  const next = row.workspaceId;
  const value = next && typeof next === "object" ? (next as Args).set : next;
  if (value !== undefined && value !== workspaceId) {
    throw new TenantIsolationError(`${model}: rows cannot be moved between workspaces.`);
  }
}

/**
 * Pure rewrite of Prisma query arguments so they can only touch rows of one
 * workspace. Exported for tests; use `tenantDb()` in application code.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  workspaceId: string,
): Args {
  if (!workspaceId) throw new TenantIsolationError("tenantDb() requires a workspaceId.");
  const next: Args = { ...(args ?? {}) };
  if (!TENANT_MODEL_SET.has(model)) return next;

  if (WHERE_OPS.has(operation)) {
    next.where = scopeWhere(next.where, workspaceId);
    if (UPDATE_OPS.has(operation)) guardUpdate(model, next.data, workspaceId);
    return next;
  }

  if (CREATE_OPS.has(operation)) {
    next.data = Array.isArray(next.data)
      ? next.data.map((row) => stampCreate(model, row, workspaceId))
      : stampCreate(model, next.data, workspaceId);
    return next;
  }

  if (operation === "upsert") {
    next.where = scopeWhere(next.where, workspaceId);
    next.create = stampCreate(model, next.create, workspaceId);
    guardUpdate(model, next.update, workspaceId);
    return next;
  }

  // Unknown operation on a tenant model: refuse rather than run unscoped.
  throw new TenantIsolationError(`${model}.${operation} is not allowed through tenantDb().`);
}

/**
 * A Prisma client that can only read and write rows of `workspaceId` for
 * tenant-scoped models. Raw queries are intentionally not exposed.
 *
 * Note: the filter applies to the model being queried. Rows reached through
 * `include`/nested writes on a relation are not rewritten, so only traverse
 * relations that stay inside the same workspace.
 */
export function tenantDb(workspaceId: string, client: PrismaClient = defaultClient) {
  if (!workspaceId) throw new TenantIsolationError("tenantDb() requires a workspaceId.");
  const scoped = client.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as Args, workspaceId) as typeof args);
        },
      },
    },
  });
  return {
    workspaceId,
    membership: scoped.membership,
    invitation: scoped.invitation,
    channel: scoped.channel,
    channelMember: scoped.channelMember,
    message: scoped.message,
    reaction: scoped.reaction,
    meeting: scoped.meeting,
    meetingInvitee: scoped.meetingInvitee,
    meetingAdmission: scoped.meetingAdmission,
    call: scoped.call,
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;
