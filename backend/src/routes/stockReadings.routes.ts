import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { logAudit } from "../lib/massBalanceEngine";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const stockReadingsRouter = Router();
stockReadingsRouter.use(requireAuth);

/** Independent physical inventory readings (tank gauge / manual stocktake).
 * Deliberately never derived from booked transactions -- this is the
 * reality check the engine compares booked stock against for the ISCC EU
 * carry-forward cap and the 0.5% tolerance check (Rules 6 and 8). */
stockReadingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId !== undefined) assertSiteAccessible(accessible, siteId);
    const readings = await prisma.physicalStockReading.findMany({
      where: { companyId: req.user!.companyId, siteId: siteId ?? siteIdFilter(accessible) },
      orderBy: { readingDate: "desc" },
    });
    res.json(readings);
  })
);

const createSchema = z.object({
  siteId: z.number().int(),
  readingDate: z.coerce.date(),
  certifiedStockQty: z.coerce.number().min(0),
  fossilStockQty: z.coerce.number().min(0).default(0),
  source: z.enum(["SENSOR", "MANUAL_STOCKTAKE"]),
});

stockReadingsRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);
    const reading = await prisma.physicalStockReading.create({
      data: { ...data, companyId: req.user!.companyId, recordedById: req.user!.userId },
    });
    await logAudit(prisma, {
      companyId: req.user!.companyId,
      entityType: "PhysicalStockReading",
      entityId: reading.id,
      action: "CREATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      afterValue: `site=${data.siteId}, certified=${data.certifiedStockQty}, fossil=${data.fossilStockQty}, source=${data.source}`,
    });
    res.status(201).json(reading);
  })
);
