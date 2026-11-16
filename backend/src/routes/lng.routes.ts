import { Router } from "express";
import { z } from "zod";
import { Unit, UserRole, LngMovementType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createLngLot, recordLngOutgoing, READ_COMMITTED } from "../lib/massBalanceEngine";
import { withRetry } from "../lib/retry";
import { idempotent } from "../middleware/idempotency";
import { decryptField } from "../lib/fieldEncryption";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

/**
 * Shared physical (uncertified) LNG ledger -- the client workbook's "Physical
 * LNG" stock. Conventional LNG is held in one pool shared by EU and PLUS;
 * each liquefaction deducts the LNG that goes with the credit (booked from
 * POST /conversions with `lngLotId`), and LNG that is sold goes through
 * POST /lng/outgoing. It carries no certification scheme and never enters the
 * EU/PLUS mass-balance maths.
 */
export const lngRouter = Router();
lngRouter.use(requireAuth);

/** Every LNG lot with what has been deducted by liquefactions, sent out, and what remains. */
lngRouter.get(
  "/lots",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId !== undefined) assertSiteAccessible(accessible, siteId);
    const lots = await prisma.lngLot.findMany({
      where: { companyId: req.user!.companyId, siteId: siteId ?? siteIdFilter(accessible) },
      include: {
        site: { select: { id: true, name: true } },
        movements: { orderBy: [{ movementDate: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ receiptDate: "desc" }, { id: "desc" }],
    });
    res.json(
      lots.map((lot) => {
        const sum = (type: LngMovementType) =>
          lot.movements.filter((m) => m.type === type).reduce((acc, m) => acc.plus(m.quantity), lot.quantity.minus(lot.quantity));
        const deducted = sum(LngMovementType.DEDUCTION);
        const outgoing = sum(LngMovementType.OUTGOING);
        return {
          ...lot,
          supplierName: decryptField(lot.supplierName) ?? null,
          movements: lot.movements.map((m) => ({ ...m, customer: decryptField(m.customer) ?? null })),
          deducted,
          outgoing,
          remaining: lot.quantity.minus(deducted).minus(outgoing),
        };
      })
    );
  })
);

const lotSchema = z.object({
  siteId: z.number().int(),
  receiptDate: z.coerce.date(),
  quantity: z.coerce.number().positive(),
  unit: z.nativeEnum(Unit).default(Unit.MMBTU),
  reference: z.string().trim().min(1).max(200),
  supplierName: z.string().trim().max(300).optional(),
});

/** Receipt of conventional LNG into the shared pool (workbook: Trader Incoming with Product = LNG). */
lngRouter.post(
  "/lots",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = lotSchema.parse(req.body);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);
    const lot = await withRetry(() =>
      prisma.$transaction(
        (tx) => createLngLot(tx, { ...data, companyId: req.user!.companyId, actor: { id: req.user!.userId, name: req.user!.name } }),
        READ_COMMITTED
      )
    );
    res.status(201).json(lot);
  })
);

const outgoingSchema = z.object({
  siteId: z.number().int(),
  lngLotId: z.number().int(),
  quantity: z.coerce.number().positive(),
  movementDate: z.coerce.date(),
  reference: z.string().trim().max(200).optional(),
  customer: z.string().trim().max(300).optional(),
});

/** Conventional LNG sold or delivered out of the pool (never above the lot's remaining balance). */
lngRouter.post(
  "/outgoing",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = outgoingSchema.parse(req.body);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);
    const movement = await withRetry(() =>
      prisma.$transaction(
        (tx) => recordLngOutgoing(tx, { ...data, companyId: req.user!.companyId, actor: { id: req.user!.userId, name: req.user!.name } }),
        READ_COMMITTED
      )
    );
    res.status(201).json(movement);
  })
);
