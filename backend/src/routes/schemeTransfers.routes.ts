import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createSchemeTransfer, createPlusToPlusTransfer, READ_COMMITTED } from "../lib/massBalanceEngine";
import { withRetry } from "../lib/retry";
import { decryptField } from "../lib/fieldEncryption";
import { idempotent } from "../middleware/idempotency";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible } from "../lib/siteAccess";

export const schemeTransfersRouter = Router();
schemeTransfersRouter.use(requireAuth);

schemeTransfersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    // Visible if EITHER leg is one of the caller's accessible sites -- a
    // scoped user has a legitimate interest in a transfer touching their
    // site whichever side of it they're on. Unrestricted callers (accessible
    // === null) get no extra filter, same as before this feature existed.
    const transfers = await prisma.schemeTransfer.findMany({
      where: {
        companyId: req.user!.companyId,
        ...(accessible !== null
          ? { OR: [{ sourceSiteId: { in: accessible } }, { targetSiteId: { in: accessible } }] }
          : {}),
      },
      include: {
        sourceSite: true,
        targetSite: true,
        batch: true,
        // The credited PLUS-side pool isn't a column -- it's the batch on
        // the linked INBOUND transaction (see Transaction.schemeTransferId).
        transactions: { include: { batch: true } },
      },
      orderBy: { transferDate: "desc" },
    });
    const shaped = transfers.map((t) => ({
      ...t,
      // The two linked transactions' counterpartyName is encrypted at rest
      // (see fieldEncryption.ts) -- decrypt before this reaches a client.
      transactions: t.transactions.map((tx) => ({ ...tx, counterpartyName: decryptField(tx.counterpartyName) ?? null })),
      sourceBatch: t.batch,
      targetBatch: t.transactions.find((tx) => tx.transactionType === "INBOUND")?.batch ?? null,
    }));
    res.json(shaped);
  })
);

const createSchema = z.object({
  sourceSiteId: z.number().int(),
  targetSiteId: z.number().int(),
  sourceBatchId: z.number().int(),
  sourcePeriodId: z.number().int(),
  targetPeriodId: z.number().int(),
  volume: z.coerce.number().positive(),
  transferDate: z.coerce.date(),
});

// One-directional ISCC EU -> ISCC PLUS only; the reverse is rejected inside
// createSchemeTransfer regardless of what the client sends.
schemeTransfersRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    // A transfer moves credits between two sites -- the actor needs
    // legitimate access to BOTH, not just one, since it draws down the
    // source pool and credits the target pool in the same action.
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    assertSiteAccessible(accessible, data.sourceSiteId);
    assertSiteAccessible(accessible, data.targetSiteId);
    const result = await withRetry(() =>
      prisma.$transaction(
        (tx) => createSchemeTransfer(tx, { ...data, companyId: req.user!.companyId, actor: { id: req.user!.userId, name: req.user!.name } }),
        READ_COMMITTED
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId));
    res.status(201).json(result);
  })
);

// B9: PLUS-to-PLUS multi-site credit transfer (client clarification) --
// distinct from the EU->PLUS transfer above. Same request shape, different
// engine function and eligibility rules (both sites ISCC_PLUS, same/
// neighboring country, instead of the fixed EU->PLUS scheme direction).
schemeTransfersRouter.post(
  "/plus-to-plus",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    assertSiteAccessible(accessible, data.sourceSiteId);
    assertSiteAccessible(accessible, data.targetSiteId);
    const result = await withRetry(() =>
      prisma.$transaction(
        (tx) => createPlusToPlusTransfer(tx, { ...data, companyId: req.user!.companyId, actor: { id: req.user!.userId, name: req.user!.name } }),
        READ_COMMITTED
      )
    );
    await getCache().delete(dashboardCacheKey(req.user!.companyId));
    res.status(201).json(result);
  })
);
