import { Router } from "express";
import { z } from "zod";
import { UserRole, ProductType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createConversionEvent, READ_COMMITTED } from "../lib/massBalanceEngine";
import { withRetry } from "../lib/retry";
import { idempotent } from "../middleware/idempotency";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const conversionsRouter = Router();
conversionsRouter.use(requireAuth);

conversionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId !== undefined) assertSiteAccessible(accessible, siteId);
    const events = await prisma.conversionEvent.findMany({
      where: { companyId: req.user!.companyId, siteId: siteId ?? siteIdFilter(accessible) },
      include: {
        site: true,
        lines: { include: { transaction: { include: { batch: true } } } },
      },
      orderBy: { conversionDate: "desc" },
    });
    res.json(events);
  })
);

const createSchema = z.object({
  siteId: z.number().int(),
  periodId: z.number().int(),
  sourceBatchId: z.number().int(),
  sourceVolume: z.coerce.number().positive(),
  conversionFactorCf: z.coerce.number().positive(),
  conversionDate: z.coerce.date(),
  targetProductType: z.nativeEnum(ProductType),
});

// Only PROCESSING_UNIT sites may run conversions -- enforced inside
// createConversionEvent, not just at this route layer.
conversionsRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);
    const result = await withRetry(() =>
      prisma.$transaction(
        (tx) => createConversionEvent(tx, { ...data, companyId: req.user!.companyId, actor: { id: req.user!.userId, name: req.user!.name } }),
        READ_COMMITTED
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId));
    res.status(201).json(result);
  })
);
