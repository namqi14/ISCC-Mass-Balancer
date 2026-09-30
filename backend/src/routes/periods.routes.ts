import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { openNewPeriod, closePeriod, ClosePeriodProductInput } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";
import { withRetry } from "../lib/retry";
import { idempotent } from "../middleware/idempotency";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const periodsRouter = Router();
periodsRouter.use(requireAuth);

periodsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId !== undefined) assertSiteAccessible(accessible, siteId);
    const periods = await prisma.period.findMany({
      where: { companyId: req.user!.companyId, siteId: siteId ?? siteIdFilter(accessible) },
      include: { site: true, balances: true },
      orderBy: [{ siteId: "asc" }, { startDate: "desc" }],
    });
    res.json(periods);
  })
);

periodsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const period = await prisma.period.findFirst({
      where: { id: Number(req.params.id), companyId: req.user!.companyId },
      include: { site: true, balances: true },
    });
    if (!period) throw new AppError("Period not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), period.siteId);
    res.json(period);
  })
);

const openPeriodSchema = z.object({
  siteId: z.number().int(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

periodsRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = openPeriodSchema.parse(req.body);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);
    const period = await withRetry(() =>
      prisma.$transaction((tx) =>
        openNewPeriod(tx, {
          companyId: req.user!.companyId,
          siteId: data.siteId,
          startDate: data.startDate,
          endDate: data.endDate,
          actor: { id: req.user!.userId, name: req.user!.name },
        })
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId)); // openPeriodCount changed
    res.status(201).json(period);
  })
);

const closePeriodSchema = z.object({
  products: z
    .array(
      z.object({
        productType: z.enum(["BIOMETHANE", "BIOLNG"]),
        openingInputInventoryA: z.coerce.number(),
        // Both optional: closePeriod defaults conversionFactorCf to 1 at a
        // TRADER site, and openingOutputInventoryB from the previous
        // period's real carried-forward balance, when omitted (see its own
        // comments in massBalanceEngine.ts for why).
        conversionFactorCf: z.coerce.number().optional(),
        openingOutputInventoryB: z.coerce.number().optional(),
        ghgValueAssigned: z.coerce.number(),
      })
    )
    .min(1),
});

// Closing a period is reserved for admin-tier roles only -- it is the
// point of no return (Rule 2: a closed period can never be reopened or
// backdated over). COMPANY_USER cannot do this.
periodsRouter.post(
  "/:id/close",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = closePeriodSchema.parse(req.body);
    const targetPeriod = await prisma.period.findFirst({ where: { id: Number(req.params.id), companyId: req.user!.companyId } });
    if (!targetPeriod) throw new AppError("Period not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), targetPeriod.siteId);
    const result = await withRetry(() =>
      prisma.$transaction((tx) =>
        closePeriod(tx, {
          companyId: req.user!.companyId,
          periodId: Number(req.params.id),
          products: data.products as ClosePeriodProductInput[],
          actor: { id: req.user!.userId, name: req.user!.name },
        })
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId)); // openPeriodCount + balances changed
    res.json({
      period: result.period,
      balances: result.results.map((r) => ({
        productType: r.productType,
        ...r.result,
        alerts: r.result.alerts,
      })),
    });
  })
);
