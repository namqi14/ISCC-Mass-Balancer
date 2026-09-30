import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getBatchAvailableVolume } from "../lib/massBalanceEngine";
import { D } from "../lib/massBalanceCalc";
import { getCache } from "../lib/cache";
import { getAccessibleSiteIds, siteIdFilter } from "../lib/siteAccess";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

/** Short TTL safety net, not the primary invalidation mechanism -- see
 * cache.ts's header comment. Every route that changes what this endpoint
 * reports calls this after its own mutation commits, always with just
 * `companyId` -- that only ever invalidates the *unrestricted* view's
 * entry. A site-scoped caller's own entry (keyed by userId too, since their
 * filtered view can't share a cache slot with anyone else's) simply expires
 * on the TTL below instead of being actively invalidated; an acceptable
 * staleness window, consistent with this cache's existing "safety net, not
 * the primary mechanism" role. */
export function dashboardCacheKey(companyId: number, userId?: number): string {
  return userId !== undefined ? `dashboard:${companyId}:${userId}` : `dashboard:${companyId}`;
}
const DASHBOARD_CACHE_TTL_MS = 30_000;

dashboardRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    // A scoped user's dashboard only reflects their accessible sites -- it
    // must not share a cache entry with the unrestricted (or a differently-
    // scoped) view.
    const cacheKey = accessible !== null ? dashboardCacheKey(companyId, req.user!.userId) : dashboardCacheKey(companyId);

    const cached = await getCache().get(cacheKey);
    if (cached) return res.json(cached);

    const siteFilter = siteIdFilter(accessible);
    const [sites, openPeriods, batches, recentAudit, periodBalances] = await Promise.all([
      prisma.site.findMany({ where: { companyId, id: siteFilter } }),
      prisma.period.count({ where: { companyId, status: "OPEN", siteId: siteFilter } }),
      prisma.batch.findMany({ where: { companyId, siteId: siteFilter } }),
      // Audit log entries aren't site-tagged (they cover Users, Sites
      // themselves, etc., not just site-scoped entities), so a scoped
      // caller still sees the company's recent audit trail unfiltered --
      // narrowing it accurately would need a per-entityType join this
      // isn't worth adding for a "recent activity" glance list.
      prisma.auditLogEntry.findMany({ where: { companyId }, orderBy: { timestamp: "desc" }, take: 10 }),
      // Real closed-period history for the dashboard trend chart -- no
      // synthetic data, just the last 12 closings the engine already
      // computed and persisted at close time.
      prisma.periodBalance.findMany({
        where: { companyId, period: { siteId: siteFilter } },
        include: { period: { include: { site: true } } },
        orderBy: { period: { endDate: "desc" } },
        take: 12,
      }),
    ]);

    let biomethaneBalance = D(0);
    let biolngBalance = D(0);
    let poolCount = 0;

    for (const b of batches) {
      const vol = await getBatchAvailableVolume(prisma, companyId, b.id);
      if (vol.equals(0) && b.isMerged === false) {
        // still counts as a pool, just empty; keep counting for visibility
      }
      poolCount += 1;
      if (b.productType === "BIOMETHANE") biomethaneBalance = biomethaneBalance.plus(vol);
      else biolngBalance = biolngBalance.plus(vol);
    }

    const periodTrend = periodBalances
      .slice()
      .reverse() // oldest -> newest, chronological order for the trend chart
      .map((pb) => ({
        periodId: pb.periodId,
        siteName: pb.period.site.name,
        productType: pb.productType,
        endDate: pb.period.endDate,
        totalAvailableB: pb.totalAvailableB.toString(),
        outgoingC: pb.outgoingC.toString(),
        closingBalance: pb.closingBalance.toString(),
      }));

    const payload = {
      siteCount: sites.length,
      openPeriodCount: openPeriods,
      poolCount,
      biomethaneBalance: biomethaneBalance.toString(),
      biolngBalance: biolngBalance.toString(),
      recentAudit,
      periodTrend,
    };
    await getCache().set(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
    res.json(payload);
  })
);
