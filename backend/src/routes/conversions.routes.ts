import { Router } from "express";
import { z } from "zod";
import { UserRole, ProductType, ConversionStage, Unit } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { createConversionEvent, logAudit, READ_COMMITTED } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";
import { CONVERSION_STAGES, siteHasStage, stageByCode, unitRuleFor, describeSourceUnits } from "../lib/conversionStages";
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


// ---------------------------------------------------------------------------
// Conversion stages and user-maintained, dated rates (client clarifications:
// 19 Oct 2026 document; 2026-11-10 -- the rates change monthly/weekly, so they
// are settings each site maintains, not numbers fixed in code). Registered
// before the plain GET "/" / POST "/" above only matters for readability --
// these are distinct literal paths.
// ---------------------------------------------------------------------------

/** The four stages with the units each takes/produces and the client
 * document's typical range. The typical range is a HINT for whoever enters a
 * rate -- never applied or enforced. */
conversionsRouter.get("/stages", (_req, res) => {
  res.json(
    CONVERSION_STAGES.map((s) => ({
      stage: s.stage,
      source: s.source,
      target: s.target,
      label: s.label,
      unitRules: s.unitRules,
    }))
  );
});

async function loadAccessibleSite(req: { user?: { userId: number; companyId: number } }, siteId: number) {
  const site = await prisma.site.findFirst({ where: { id: siteId, companyId: req.user!.companyId } });
  if (!site) throw new AppError("Site not found.", 404);
  assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), siteId);
  return site;
}

/** GET /conversions/rates?siteId=&asOf=YYYY-MM-DD[&history=1]
 * Default: the rate IN FORCE on `asOf` (default today) for each (stage,
 * sourceUnit) -- the latest row with effectiveFrom <= asOf. `history=1`
 * returns every dated row instead. */
conversionsRouter.get(
  "/rates",
  asyncHandler(async (req, res) => {
    const siteId = Number(req.query.siteId);
    if (!Number.isInteger(siteId)) throw new AppError("siteId is required.");
    await loadAccessibleSite(req, siteId);

    if (req.query.history === "1") {
      const rows = await prisma.conversionRate.findMany({
        where: { companyId: req.user!.companyId, siteId },
        orderBy: [{ stage: "asc" }, { sourceUnit: "asc" }, { effectiveFrom: "desc" }],
      });
      res.json(rows);
      return;
    }

    const asOf = req.query.asOf ? new Date(String(req.query.asOf)) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new AppError("asOf must be a valid date (YYYY-MM-DD).");
    const rows = await prisma.conversionRate.findMany({
      where: { companyId: req.user!.companyId, siteId, effectiveFrom: { lte: asOf } },
      orderBy: { effectiveFrom: "desc" },
    });
    const inForce = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.stage}|${r.sourceUnit}`;
      if (!inForce.has(key)) inForce.set(key, r); // rows are newest-first, so the first seen wins
    }
    res.json([...inForce.values()].sort((a, b) => a.stage.localeCompare(b.stage) || a.sourceUnit.localeCompare(b.sourceUnit)));
  })
);

const rateSchema = z.object({
  siteId: z.number().int(),
  stage: z.nativeEnum(ConversionStage),
  sourceUnit: z.nativeEnum(Unit),
  factor: z.coerce.number().positive(),
  // The user's OWN tolerance range -- optional; outside it a conversion is
  // warned, never rejected.
  minFactor: z.coerce.number().positive().nullable().optional(),
  maxFactor: z.coerce.number().positive().nullable().optional(),
  effectiveFrom: z.coerce.date(),
  note: z.string().max(300).optional(),
});

// Admin-tier only: a rate drives every conversion's pre-filled factor, so
// COMPANY_USER stays read-only (client clarification: admins configure, users
// operate). Saving the same (site, stage, unit, effectiveFrom) again CORRECTS
// that row instead of adding a duplicate.
conversionsRouter.post(
  "/rates",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    const data = rateSchema.parse(req.body);
    const site = await loadAccessibleSite(req, data.siteId);

    if (!siteHasStage(site, data.stage)) {
      throw new AppError(`Site "${site.name}" does not run ${data.stage}. Enable it in Site Management before setting its rate.`);
    }
    const stage = stageByCode(data.stage);
    if (!unitRuleFor(stage, data.sourceUnit as any)) {
      throw new AppError(`${stage.label} takes ${describeSourceUnits(stage)} as its source unit.`);
    }
    const min = data.minFactor ?? null;
    const max = data.maxFactor ?? null;
    if (min !== null && max !== null && min > max) throw new AppError("minFactor cannot be greater than maxFactor.");
    if (min !== null && data.factor < min) throw new AppError("The rate is below its own minFactor.");
    if (max !== null && data.factor > max) throw new AppError("The rate is above its own maxFactor.");

    const where = {
      siteId_stage_sourceUnit_effectiveFrom: {
        siteId: data.siteId,
        stage: data.stage,
        sourceUnit: data.sourceUnit,
        effectiveFrom: data.effectiveFrom,
      },
    };
    const existing = await prisma.conversionRate.findUnique({ where });
    const row = await prisma.conversionRate.upsert({
      where,
      create: {
        companyId: req.user!.companyId,
        siteId: data.siteId,
        stage: data.stage,
        sourceUnit: data.sourceUnit,
        factor: data.factor,
        minFactor: min,
        maxFactor: max,
        effectiveFrom: data.effectiveFrom,
        note: data.note,
        createdById: req.user!.userId,
      },
      update: { factor: data.factor, minFactor: min, maxFactor: max, note: data.note, createdById: req.user!.userId },
    });
    await logAudit(prisma, {
      companyId: req.user!.companyId,
      entityType: "ConversionRate",
      entityId: row.id,
      action: existing ? "UPDATE" : "CREATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      beforeValue: existing ? JSON.stringify(existing) : null,
      afterValue: JSON.stringify(row),
      notes: `${data.stage} ${data.sourceUnit} rate for "${site.name}" effective ${data.effectiveFrom.toISOString().slice(0, 10)}`,
    });
    res.status(existing ? 200 : 201).json(row);
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
