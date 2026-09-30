import { Router } from "express";
import { z } from "zod";
import { UserRole, TransactionType, ConversionRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { getBatchAvailableVolume, mergeBatches, READ_COMMITTED } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";
import { withRetry } from "../lib/retry";
import { idempotent } from "../middleware/idempotency";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const batchesRouter = Router();
batchesRouter.use(requireAuth);

/** Pools & balances view: every batch at the company, each with its live
 * available volume. This is the "Pools" tab from the reference prototype,
 * now backed by the real ledger instead of client-side aggregation. */
batchesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const siteId = req.query.siteId ? Number(req.query.siteId) : undefined;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId !== undefined) assertSiteAccessible(accessible, siteId);
    const batches = await prisma.batch.findMany({
      where: { companyId: req.user!.companyId, siteId: siteId ?? siteIdFilter(accessible) },
      include: {
        site: true,
        // Cheap existence check so the frontend can decide whether to show
        // the "Conversion trace" button without a request per row.
        transactions: { where: { transactionType: TransactionType.CONVERSION_IN }, take: 1, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const withVolume = await Promise.all(
      batches.map(async (b) => {
        const { transactions, ...rest } = b;
        return {
          ...rest,
          hasConversionTrace: transactions.length > 0,
          availableVolume: (await getBatchAvailableVolume(prisma, req.user!.companyId, b.id)).toString(),
        };
      })
    );
    res.json(withVolume);
  })
);

batchesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const batch = await prisma.batch.findFirst({
      where: { id: Number(req.params.id), companyId: req.user!.companyId },
      include: {
        site: true,
        transactions: { orderBy: { transactionDate: "desc" } },
        mergesAsSource: true,
        mergesAsResult: true,
      },
    });
    if (!batch) throw new AppError("Batch not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), batch.siteId);
    const availableVolume = await getBatchAvailableVolume(prisma, req.user!.companyId, batch.id);
    res.json({ ...batch, availableVolume: availableVolume.toString() });
  })
);

/**
 * Conversion trace for one batch/pool.
 *
 * Two genuinely different numbers live in this response, and the frontend
 * must not blur them together (the mock modal it replaces did):
 *
 * 1. `conversionEvent` -- the specific event that fed this batch:
 *    resultVolume = sourceVolume x conversionFactorCf. This is always real
 *    and always available, closed period or not: it's stored directly on
 *    ConversionEvent and its two linked transactions at the moment the
 *    conversion was booked.
 * 2. `periodBalance` -- the *period-level* B = (A + a) x CF + b figures.
 *    `a` (openingInputInventoryA), `b` (openingOutputInventoryB), and the
 *    period-close CF are not derived from transactions -- they are typed in
 *    by whoever closes the period (see closePeriod in massBalanceEngine.ts)
 *    and are not the same number as this conversion's own CF. They simply
 *    do not exist until the period closes, so this is `null` for an open
 *    period rather than a guessed/derived value. Do not fabricate one.
 */
batchesRouter.get(
  "/:id/trace",
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const batch = await prisma.batch.findFirst({ where: { id: Number(req.params.id), companyId } });
    if (!batch) throw new AppError("Batch not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), batch.siteId);

    // The most recent conversion that credited this pool, if any.
    const conversionInTx = await prisma.transaction.findFirst({
      where: { batchId: batch.id, companyId, transactionType: TransactionType.CONVERSION_IN },
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      include: {
        conversionLines: {
          where: { role: ConversionRole.OUTPUT },
          include: { conversionEvent: { include: { period: true } } },
        },
      },
    });
    const eventLine = conversionInTx?.conversionLines[0];
    if (!conversionInTx || !eventLine) {
      throw new AppError("This pool was not created by a conversion -- there is nothing to trace.", 404);
    }
    const event = eventLine.conversionEvent;

    const inputLine = await prisma.conversionLine.findFirst({
      where: { conversionEventId: event.id, role: ConversionRole.INPUT, companyId },
      include: { transaction: { include: { batch: true } } },
    });
    if (!inputLine) throw new AppError("Conversion event is missing its source leg -- data inconsistency.", 500);
    const sourceTx = inputLine.transaction;

    const periodBalance =
      event.period.status === "CLOSED"
        ? await prisma.periodBalance.findFirst({ where: { periodId: event.period.id, productType: batch.productType } })
        : null;

    const merges = await prisma.batchMerge.findMany({ where: { resultBatchId: batch.id, companyId } });

    res.json({
      batchId: batch.id,
      productType: batch.productType,
      ghgValue: batch.ghgValue.toString(),
      conversionEvent: {
        id: event.id,
        conversionDate: event.conversionDate,
        conversionFactorCf: event.conversionFactorCf.toString(),
        sourceVolume: sourceTx.volume.toString(),
        resultVolume: conversionInTx.volume.toString(),
        sourceBatch: {
          id: sourceTx.batch.id,
          productType: sourceTx.batch.productType,
          rawMaterial: sourceTx.batch.rawMaterial,
          countryOfOrigin: sourceTx.batch.countryOfOrigin,
          certScheme: sourceTx.batch.certScheme,
        },
      },
      period: {
        id: event.period.id,
        startDate: event.period.startDate,
        endDate: event.period.endDate,
        status: event.period.status,
      },
      periodBalance: periodBalance
        ? {
            incomingA: periodBalance.incomingA.toString(),
            openingInputInventoryA: periodBalance.openingInputInventoryA.toString(),
            conversionFactorCf: periodBalance.conversionFactorCf.toString(),
            openingOutputInventoryB: periodBalance.openingOutputInventoryB.toString(),
            totalAvailableB: periodBalance.totalAvailableB.toString(),
            outgoingC: periodBalance.outgoingC.toString(),
            closingBalance: periodBalance.closingBalance.toString(),
            creditsCarriedForward: periodBalance.creditsCarriedForward.toString(),
          }
        : null,
      merge:
        merges.length > 0
          ? {
              assignedGhgValue: batch.ghgValue.toString(),
              sources: merges.map((m) => ({
                batchId: m.sourceBatchId,
                ghgValue: m.sourceGhgValue.toString(),
                contributedVolume: m.contributedVolume.toString(),
              })),
            }
          : null,
    });
  })
);

const mergeSchema = z.object({
  batchIds: z.array(z.number().int()).min(2),
  // WORST_CASE (Rule 7's original max-across-sources) if omitted -- both are
  // valid choices per the client's clarification, not a right/wrong pair.
  ghgMode: z.enum(["WORST_CASE", "ACTUAL"]).optional(),
});

batchesRouter.post(
  "/merge",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = mergeSchema.parse(req.body);
    // Every source batch's site must be accessible to the caller -- a merge
    // can span sites when multi-site balancing is enabled, and each one
    // needs to be a site the actor is actually allowed to act on.
    const sourceBatches = await prisma.batch.findMany({
      where: { id: { in: data.batchIds }, companyId: req.user!.companyId },
      select: { siteId: true },
    });
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    for (const siteId of new Set(sourceBatches.map((b) => b.siteId))) {
      assertSiteAccessible(accessible, siteId);
    }
    const merged = await withRetry(() =>
      prisma.$transaction(
        (tx) =>
          mergeBatches(tx, {
            companyId: req.user!.companyId,
            batchIds: data.batchIds,
            ghgMode: data.ghgMode,
            actor: { id: req.user!.userId, name: req.user!.name },
          }),
        READ_COMMITTED
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId)); // poolCount changed
    res.status(201).json(merged);
  })
);
