/**
 * Site-scoped RBAC (client clarification's 3-tier hierarchy, layered on top
 * of the existing 3-value UserRole rather than a 4th role -- see the
 * UserSiteAccess model's own comment in schema.prisma and PRODUCT.md for
 * why). SUPER_ADMIN is untouched by any of this: it's a separate, KIV'd,
 * cross-company concern, not a site-scoping one.
 *
 * A user with NO UserSiteAccess rows is unrestricted within their company --
 * today's existing behavior, unchanged (the client's "Top Level/
 * Certification Manager"). A user WITH rows is scoped to only those sites,
 * at whatever role-level power (COMPANY_ADMIN or COMPANY_USER) they already
 * hold (the client's "Certification Executive"/"Clerk").
 */

import { prisma } from "./prisma";
import { AppError } from "./errors";

/** Returns the user's accessible site IDs, or `null` if unrestricted (no
 * scoping rows at all -- every site in their company is accessible). */
export async function getAccessibleSiteIds(userId: number): Promise<number[] | null> {
  const rows = await prisma.userSiteAccess.findMany({ where: { userId }, select: { siteId: true } });
  if (rows.length === 0) return null;
  return rows.map((r) => r.siteId);
}

/** Throws a 403 AppError if the given accessible-site list is non-null (the
 * caller is scoped) and doesn't include `siteId`. A no-op for an
 * unrestricted caller (`accessible === null`). Takes the already-fetched
 * list rather than a userId so a route that needs to check several sites
 * in one request (e.g. a scheme transfer's source AND target) only fetches
 * it once. */
export function assertSiteAccessible(accessible: number[] | null, siteId: number, message?: string): void {
  if (accessible !== null && !accessible.includes(siteId)) {
    throw new AppError(message ?? "You do not have access to this site.", 403, "SITE_ACCESS_DENIED");
  }
}

/** Prisma where-clause fragment restricting a query to accessible sites --
 * `undefined` (no filter -- matches everything) for an unrestricted caller,
 * `{ in: [...] }` for a scoped one. A scoped caller with zero accessible
 * sites (not possible in practice -- having any UserSiteAccess row at all
 * means at least one -- but handled correctly regardless) yields `{ in: [] }`,
 * i.e. "nothing," never silently "everything." */
export function siteIdFilter(accessible: number[] | null): { in: number[] } | undefined {
  return accessible === null ? undefined : { in: accessible };
}
