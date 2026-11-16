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

    // Balances are grouped by product AND unit: a pool's volume is only
    // meaningful in its own unit (m3, Nm3, kg, MMBtu ...), so adding pools held
    // in different units into one number would be meaningless. Each product
    // therefore reports one balance per unit it is actually held in.
    const balanceByKey = new Map<string, { productType: string; unit: string; volume: ReturnType<typeof D>; poolCount: number }>();
    let poolCount = 0;

    for (const b of batches) {
      const vol = await getBatchAvailableVolume(prisma, companyId, b.id);
      poolCount += 1; // an empty pool still counts, for visibility
      const key = `${b.productType}:${b.unit}`;
      const row = balanceByKey.get(key) ?? { productType: b.productType, unit: b.unit, volume: D(0), poolCount: 0 };
      row.volume = row.volume.plus(vol);
      row.poolCount += 1;
      balanceByKey.set(key, row);
    }
    const balances = [...balanceByKey.values()]
      .sort((a, b) => a.productType.localeCompare(b.productType) || a.unit.localeCompare(b.unit))
      .map((r) => ({ productType: r.productType, unit: r.unit, volume: r.volume.toString(), poolCount: r.poolCount }));

    // The unit each closed period's balance is in. A period cannot close with
    // more than one unit for a product (closePeriod refuses), so (period, product)
    // maps to exactly one unit; read it from the batches the period booked against.
    const trendPeriodIds = [...new Set(periodBalances.map((pb) => pb.periodId))];
    const trendUnits = new Map<string, string>();
    if (trendPeriodIds.length > 0) {
      const booked = await prisma.transaction.findMany({
        where: { companyId, periodId: { in: trendPeriodIds } },
        select: { periodId: true, batch: { select: { productType: true, unit: true } } },
        distinct: ["periodId", "batchId"],
      });
      for (const t of booked) trendUnits.set(`${t.periodId}:${t.batch.productType}`, t.batch.unit);
    }

    const periodTrend = periodBalances
      .slice()
      .reverse() // oldest -> newest, chronological order for the trend chart
      .map((pb) => ({
        periodId: pb.periodId,
        siteName: pb.period.site.name,
        productType: pb.productType,
        unit: trendUnits.get(`${pb.periodId}:${pb.productType}`) ?? null,
        endDate: pb.period.endDate,
        totalAvailableB: pb.totalAvailableB.toString(),
        outgoingC: pb.outgoingC.toString(),
        closingBalance: pb.closingBalance.toString(),
      }));

    const payload = {
      siteCount: sites.length,
      openPeriodCount: openPeriods,
      poolCount,
      balances,
      recentAudit,
      periodTrend,
    };
    await getCache().set(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
    res.json(payload);
  })
);
