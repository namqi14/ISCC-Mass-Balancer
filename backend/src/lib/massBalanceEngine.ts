/**
 * ISCC Mass Balance -- orchestration layer.
 *
 * TypeScript port of the `MassBalanceEngine` class in
 * References/mass_balance_engine.py, adapted to Prisma + the extended
 * schema (conversion events, scheme transfers, operator types) from
 * References/iscc_mass_balance_schema.dbml.
 *
 * Every function here takes a Prisma transaction client (`Tx`) as its first
 * argument so route handlers can compose several of these inside a single
 * `prisma.$transaction(...)` and get true all-or-nothing writes -- e.g. a
 * period close either persists every product-type balance and flips the
 * period to CLOSED, or persists nothing at all.
 */

import { Prisma, TransactionType, PeriodStatus, ConversionRole } from "@prisma/client";
import { prisma } from "./prisma";
import {
  D,
  computePeriodBalance,
  Alert,
} from "./massBalanceCalc";
import {
  AppError,
  CertificateValidityError,
  ConversionNotAllowedError,
  InsufficientStockError,
  MultiSiteBalancingDisabledError,
  PeriodCloseConflictError,
  PeriodClosedError,
  PeriodContinuityError,
  PhysicalLinkMissingError,
  PlusToPlusTransferNotAllowedError,
  SchemeTransferDirectionError,
} from "./errors";
import { encryptField } from "./fieldEncryption";
import { enqueueJob } from "./jobs";

export type Tx = Prisma.TransactionClient | typeof prisma;

const IN_TYPES: TransactionType[] = [TransactionType.INBOUND, TransactionType.CONVERSION_IN];
const OUT_TYPES: TransactionType[] = [TransactionType.OUTBOUND, TransactionType.CONVERSION_OUT];

export interface Actor {
  // null for actions with no human actor (e.g. the job worker processing a
  // queued notification) -- AuditLogEntry.actorId is a nullable FK for
  // exactly this reason; actorName is still always recorded.
  id: number | null;
  name: string;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export async function logAudit(
  tx: Tx,
  params: {
    companyId: number;
    entityType: string;
    entityId: number;
    action: string;
    actor: Actor;
    beforeValue?: string | null;
    afterValue?: string | null;
    notes?: string | null;
  }
) {
  await tx.auditLogEntry.create({
    data: {
      companyId: params.companyId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actor.id,
      actorName: params.actor.name,
      beforeValue: params.beforeValue ?? null,
      afterValue: params.afterValue ?? null,
      notes: params.notes ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Batch pooling helpers
// ---------------------------------------------------------------------------

/**
 * Find an existing (non-merged) batch sharing all four sustainability
 * grouping-key attributes at a site, or create a new one. This is what
 * gives users the "pooled stock" experience from the reference prototype:
 * they never manage Batch rows directly, they just describe the material.
 *
 * Race-safe: two concurrent calls for the very first delivery of a brand-
 * new pool can both miss the lookup below and both attempt to create it.
 * Rather than a lock (there's no row yet to lock), the `batches.poolKey`
 * generated column + unique index (see its migration) makes the DB itself
 * the referee -- the loser's `create` fails with a unique-constraint error
 * (P2002), which is caught here and turned into a re-read of the pool the
 * winner just created, so both callers still get back the one true pool.
 */
export async function findOrCreateBatch(
  tx: Tx,
  params: {
    companyId: number;
    siteId: number;
    certScheme: "ISCC_EU" | "ISCC_PLUS";
    rawMaterial: string;
    countryOfOrigin: string;
    ghgValue: Prisma.Decimal.Value;
    productType: "BIOMETHANE" | "BIOLNG";
    unit: "M3" | "METRIC_TONS" | "KG" | "M3_15C" | "J" | "KWH";
    // Only used to populate a brand-new pool -- see below, these three are
    // deliberately NOT part of the lookup/pooling key (whereClause), so
    // reusing an existing pool never rewrites them from a later delivery.
    ghgValueType: "DDV" | "DV" | "AV";
    materialCategory: string;
    wasteStatus?: "PRE_CONSUMER" | "POST_CONSUMER" | "MIXED" | "UNSPECIFIED" | null;
  }
) {
  const ghg = D(params.ghgValue);
  // Mirrors the batches.poolKey generated column exactly (companyId, siteId,
  // certScheme, rawMaterial, countryOfOrigin, productType, ghgValue, unit) --
  // this must never diverge from what that column's unique index enforces,
  // or the P2002-catch-and-reread race fix below stops working (the reread
  // would use a different key than the one the DB actually rejected on).
  // ghgValueType/materialCategory/wasteStatus deliberately don't join this
  // key: they're documentation attributes established once by whichever
  // delivery first creates the pool, not additional dimensions a pool is
  // split on the way ghgValue/unit are.
  const whereClause = {
    companyId: params.companyId,
    siteId: params.siteId,
    certScheme: params.certScheme,
    rawMaterial: params.rawMaterial,
    countryOfOrigin: params.countryOfOrigin,
    productType: params.productType,
    isMerged: false,
    ghgValue: ghg,
    unit: params.unit,
  };

  const existing = await tx.batch.findFirst({ where: whereClause });
  if (existing) return existing;

  try {
    return await tx.batch.create({
      data: {
        companyId: params.companyId,
        siteId: params.siteId,
        certScheme: params.certScheme,
        rawMaterial: params.rawMaterial,
        countryOfOrigin: params.countryOfOrigin,
        ghgValue: ghg,
        productType: params.productType,
        unit: params.unit,
        ghgValueType: params.ghgValueType,
        materialCategory: params.materialCategory,
        wasteStatus: params.wasteStatus ?? null,
        isMerged: false,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const wonByOther = await tx.batch.findFirst({ where: whereClause });
      if (wonByOther) return wonByOther;
    }
    throw err;
  }
}

/** Current available volume of a batch: everything that has flowed in
 * (inbound, conversion-in, merge contributions) minus everything that has
 * flowed out (outbound, conversion-out, merge consumption). Never derived
 * from a cached column -- always recomputed from the ledger so it can't
 * drift. Scheme transfers don't need their own line here: per Database
 * Schema.pdf's transactions.scheme_transfer_id link, a transfer books a
 * normal OUTBOUND (source pool) and INBOUND (target pool) transaction, so
 * the transaction sums below already include transfer volume. */
/**
 * Locks one or more Batch rows for the rest of the enclosing DB transaction
 * (`SELECT ... FOR UPDATE`), so a concurrent request touching the same
 * batch has to wait rather than racing it.
 *
 * Why this exists: every "does this write exceed what's available" check
 * (Rule 5, and the equivalent checks in conversions and scheme transfers)
 * was previously a plain read (`getBatchAvailableVolume`) followed later by
 * an insert, both inside one `$transaction` but with no lock in between.
 * Two concurrent requests against the same pool could both read the same
 * available volume before either committed its insert, both pass the
 * check, and jointly overdraw the pool -- exactly what Rule 5 exists to
 * prevent. Call this immediately before the read that feeds such a check,
 * for every batch the subsequent write depends on, so the second request
 * physically cannot proceed past this line until the first has committed.
 *
 * Batch IDs are locked in ascending order when there's more than one
 * (e.g. a merge), so two concurrent calls that both touch an overlapping
 * set of batches always acquire their locks in the same order and can't
 * deadlock each other.
 *
 * This alone is NOT sufficient -- see READ_COMMITTED below, which every
 * route calling this must also pass to `prisma.$transaction(...)`.
 */
async function lockBatchesForUpdate(tx: Tx, companyId: number, batchIds: number[]): Promise<void> {
  const ids = [...new Set(batchIds)].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM batches WHERE companyId = ${companyId} AND id IN (${Prisma.join(ids)}) FOR UPDATE`;
}

/**
 * Pass as the second argument to every `prisma.$transaction(...)` call that
 * uses `lockBatchesForUpdate` (recording a transaction, a conversion, a
 * scheme transfer, or a merge). Confirmed necessary by direct testing, not
 * a defensive guess: MySQL's default REPEATABLE READ isolation gives a
 * transaction one fixed snapshot for its ordinary (non-locking) reads, taken
 * at that transaction's *first* plain read -- which in these functions
 * happens before `lockBatchesForUpdate` is ever called (e.g. the period
 * lookup at the top of `recordTransaction`). So even after correctly
 * waiting for the row lock, `getBatchAvailableVolume`'s aggregate reads
 * would still see the pre-lock-wait snapshot and silently miss whatever the
 * other request just committed -- the check would pass on stale data and
 * both requests would still succeed. READ COMMITTED gives every individual
 * read within the transaction the latest committed data as of that read,
 * so the aggregate read that runs right after the lock wait actually sees
 * what the other request committed.
 */
export const READ_COMMITTED = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

export async function getBatchAvailableVolume(tx: Tx, companyId: number, batchId: number): Promise<Prisma.Decimal> {
  const [inSum, outSum, mergeIn, mergeOut] = await Promise.all([
    tx.transaction.aggregate({
      _sum: { volume: true },
      where: { companyId, batchId, transactionType: { in: IN_TYPES } },
    }),
    tx.transaction.aggregate({
      _sum: { volume: true },
      where: { companyId, batchId, transactionType: { in: OUT_TYPES } },
    }),
    tx.batchMerge.aggregate({ _sum: { contributedVolume: true }, where: { companyId, resultBatchId: batchId } }),
    tx.batchMerge.aggregate({ _sum: { contributedVolume: true }, where: { companyId, sourceBatchId: batchId } }),
  ]);

  return D(inSum._sum.volume ?? 0)
    .plus(D(mergeIn._sum.contributedVolume ?? 0))
    .minus(D(outSum._sum.volume ?? 0))
    .minus(D(mergeOut._sum.contributedVolume ?? 0));
}

// ---------------------------------------------------------------------------
// Rule 2 (+ 3-month cap): period continuity
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

export async function openNewPeriod(
  tx: Tx,
  params: { companyId: number; siteId: number; startDate: Date; endDate: Date; actor: Actor }
) {
  if (params.endDate <= params.startDate) {
    throw new PeriodContinuityError("Period end date must be after the start date.");
  }
  const maxEnd = addMonths(params.startDate, 3);
  if (params.endDate > maxEnd) {
    throw new PeriodContinuityError(
      `Balancing periods cannot exceed 3 months. Given start date ${params.startDate.toISOString().slice(0, 10)}, ` +
        `end date must be on or before ${maxEnd.toISOString().slice(0, 10)}.`
    );
  }

  // Also closes a pre-existing gap: this function never actually verified
  // the site exists / belongs to the company before creating a period
  // against it. Needed anyway to read the certificate fields below.
  const site = await tx.site.findFirst({ where: { id: params.siteId, companyId: params.companyId } });
  if (!site) throw new AppError("Site not found.", 404);

  // Client clarification (2026-08-25): a period must fall within the site's
  // current ISCC certificate validity window, when one is on file. A site
  // with no certificate recorded yet (certifiedFrom/certifiedTo both null)
  // is unconstrained by this -- see the field comments on Site in
  // schema.prisma for why both are nullable.
  if (site.certifiedFrom && site.certifiedTo) {
    if (params.startDate < site.certifiedFrom || params.endDate > site.certifiedTo) {
      throw new CertificateValidityError(
        `Period ${params.startDate.toISOString().slice(0, 10)} to ${params.endDate.toISOString().slice(0, 10)} falls ` +
          `outside "${site.name}"'s current ISCC certificate validity window (${site.certifiedFrom
            .toISOString()
            .slice(0, 10)} to ${site.certifiedTo.toISOString().slice(0, 10)}` +
          `${site.certificateNumber ? `, certificate ${site.certificateNumber}` : ""}). ` +
          `A new/renewed certificate's dates must be on file before a period outside this window can be opened.`
      );
    }
  }

  const lastPeriod = await tx.period.findFirst({
    where: { companyId: params.companyId, siteId: params.siteId },
    orderBy: { endDate: "desc" },
  });

  if (lastPeriod) {
    const expectedStart = addDays(lastPeriod.endDate, 1);
    if (expectedStart.getTime() !== params.startDate.getTime()) {
      throw new PeriodContinuityError(
        `New period must start on ${expectedStart.toISOString().slice(0, 10)} (the day after the previous period ` +
          `ended on ${lastPeriod.endDate.toISOString().slice(0, 10)}); got ${params.startDate
            .toISOString()
            .slice(0, 10)}. Mass balance periods must be continuous with no gaps.`
      );
    }
    if (lastPeriod.status !== PeriodStatus.CLOSED) {
      throw new PeriodContinuityError(`Previous period #${lastPeriod.id} is still OPEN. Close it before opening a new one.`);
    }
  }

  // Rule 2's continuity check above is a plain read; two concurrent opens for
  // the same site can both pass it before either commits. `uq_period_site_start`
  // (`@@unique([siteId, startDate])`) is the real backstop -- catch the
  // loser's violation here and turn it into the same clean error the check
  // above would have thrown if it had read the winner's row first, rather
  // than a raw Prisma error. Deliberately rejects instead of silently handing
  // back the winner's period (unlike `findOrCreateBatch`'s shared-pool
  // re-read): misattributing who opened a period would be wrong.
  let period;
  try {
    period = await tx.period.create({
      data: {
        companyId: params.companyId,
        siteId: params.siteId,
        startDate: params.startDate,
        endDate: params.endDate,
        status: PeriodStatus.OPEN,
        previousPeriodId: lastPeriod ? lastPeriod.id : null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PeriodContinuityError(
        `A period for this site starting on ${params.startDate.toISOString().slice(0, 10)} already exists ` +
          `(opened by a concurrent request). Refresh the period list before opening a new one.`
      );
    }
    throw err;
  }

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "Period",
    entityId: period.id,
    action: "OPEN",
    actor: params.actor,
    notes: `Opened period ${params.startDate.toISOString().slice(0, 10)} to ${params.endDate
      .toISOString()
      .slice(0, 10)} for site ${params.siteId}.`,
  });

  return period;
}

// ---------------------------------------------------------------------------
// Rule 3 (+ Rule 5 real-time check): transactions
// ---------------------------------------------------------------------------

export async function recordTransaction(
  tx: Tx,
  params: {
    companyId: number;
    siteId: number;
    periodId: number;
    batchId: number;
    transactionType: "INBOUND" | "OUTBOUND";
    volume: Prisma.Decimal.Value;
    transactionDate: Date;
    counterpartyName?: string | null;
    counterpartyCertNumber?: string | null;
    physicalDocumentId?: number | null;
    actor: Actor;
  }
) {
  const volume = D(params.volume);
  if (volume.lessThanOrEqualTo(0)) {
    throw new AppError("Volume must be greater than zero.");
  }

  const period = await tx.period.findFirst({ where: { id: params.periodId, companyId: params.companyId } });
  if (!period) throw new AppError("Period not found.", 404);
  if (period.status !== PeriodStatus.OPEN) {
    throw new PeriodClosedError(`Period #${period.id} is CLOSED. Transactions cannot be booked against a closed period.`);
  }

  // Rule 3: inbound transactions must reference a weighbridge ticket / delivery note.
  if (params.transactionType === "INBOUND" && !params.physicalDocumentId) {
    throw new PhysicalLinkMissingError(
      "Inbound transactions must reference a weighbridge ticket or delivery note before a sustainability credit can be booked."
    );
  }

  // Real-time stock check: outgoing volume can never exceed what is on hand for this pool.
  if (params.transactionType === "OUTBOUND") {
    await lockBatchesForUpdate(tx, params.companyId, [params.batchId]);
    const available = await getBatchAvailableVolume(tx, params.companyId, params.batchId);
    if (volume.greaterThan(available)) {
      throw new InsufficientStockError(
        `Outgoing volume (${volume}) exceeds the available balance (${available}) for this stock pool. ` +
          `Outgoing stock can never exceed what is actually available.`
      );
    }
  }

  const transaction = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: params.siteId,
      periodId: params.periodId,
      batchId: params.batchId,
      transactionType: params.transactionType as TransactionType,
      volume,
      transactionDate: params.transactionDate,
      // Encrypted at rest -- see fieldEncryption.ts.
      counterpartyName: encryptField(params.counterpartyName ?? null),
      counterpartyCertNumber: encryptField(params.counterpartyCertNumber ?? null),
      physicalDocumentId: params.physicalDocumentId ?? null,
      createdById: params.actor.id,
    },
  });
  // Callers get the real (plaintext) values back, not ciphertext -- no need
  // to round-trip through decryptField, we already have the originals.
  transaction.counterpartyName = params.counterpartyName ?? null;
  transaction.counterpartyCertNumber = params.counterpartyCertNumber ?? null;

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "Transaction",
    entityId: transaction.id,
    action: "CREATE",
    actor: params.actor,
    afterValue: `type=${params.transactionType}, volume=${volume}, batch=${params.batchId}`,
  });

  return transaction;
}

// ---------------------------------------------------------------------------
// Rule 1 + Rule 7: batch merging
// ---------------------------------------------------------------------------

export async function mergeBatches(
  tx: Tx,
  params: {
    companyId: number;
    batchIds: number[];
    actor: Actor;
    // Client clarification: both are valid choices for how the merged
    // pool's GHG value is assigned, not one right/one wrong answer.
    // WORST_CASE (Rule 7's original max-across-sources) stays the default
    // for any caller that doesn't pass this, so existing behavior is
    // unchanged unless a caller deliberately opts into ACTUAL.
    ghgMode?: "WORST_CASE" | "ACTUAL";
  }
) {
  if (params.batchIds.length < 2) {
    throw new AppError("Select at least two batches to merge.");
  }
  const batches = await tx.batch.findMany({ where: { id: { in: params.batchIds }, companyId: params.companyId } });
  if (batches.length !== params.batchIds.length) {
    throw new AppError("One or more batches were not found.", 404);
  }

  // Lock every source batch before snapshotting its contributed volume
  // below -- otherwise a concurrent write against one of them between that
  // snapshot and this merge committing would leave the merge's recorded
  // contributedVolume (and everything summed from it afterwards) stale.
  await lockBatchesForUpdate(tx, params.companyId, batches.map((b) => b.id));

  const siteIds = new Set(batches.map((b) => b.siteId));
  if (siteIds.size > 1) {
    const sites = await tx.site.findMany({ where: { id: { in: [...siteIds] } } });
    if (!sites.every((s) => s.multiSiteBalancingEnabled)) {
      throw new MultiSiteBalancingDisabledError(
        "Cannot merge batches from different sites: multi-site balancing is disabled for at least one of the sites involved."
      );
    }
  }

  // unit and materialCategory join this check alongside the original four:
  // mixing units would make the merged pool's running balance a sum of
  // incompatible quantities, and mixing material categories would
  // misrepresent the resulting pool's own classification. ghgValueType and
  // wasteStatus are documentation attributes, not structural -- sources may
  // differ on those and still merge cleanly (the merged batch just inherits
  // the first source's values for them, same as it already does for siteId).
  const attrKey = (b: (typeof batches)[number]) =>
    `${b.rawMaterial}||${b.countryOfOrigin}||${b.certScheme}||${b.productType}||${b.unit}||${b.materialCategory}`;
  if (new Set(batches.map(attrKey)).size > 1) {
    throw new AppError(
      "Only batches sharing raw material, country of origin, certification scheme, product type, unit, and material category may be merged into one pool."
    );
  }

  // Snapshot each source's available (contributable) volume up front -- both
  // GHG modes need it (ACTUAL to weight by it, WORST_CASE just to record it
  // per BatchMerge row as before), and computing it once here avoids a
  // second round of identical queries in the loop that used to follow.
  const volumes = new Map<number, Prisma.Decimal>();
  for (const b of batches) {
    volumes.set(b.id, await getBatchAvailableVolume(tx, params.companyId, b.id));
  }

  const ghgMode = params.ghgMode ?? "WORST_CASE";
  let mergedGhg: Prisma.Decimal;
  if (ghgMode === "ACTUAL") {
    // Volume-weighted average across sources -- "the actual value of
    // current stock" per the client's clarification, as opposed to Rule 7's
    // conservative worst-case max.
    const totalVolume = [...volumes.values()].reduce((sum, v) => sum.plus(v), D(0));
    if (totalVolume.greaterThan(0)) {
      const weightedSum = batches.reduce((sum, b) => sum.plus(b.ghgValue.times(volumes.get(b.id)!)), D(0));
      mergedGhg = weightedSum.dividedBy(totalVolume);
    } else {
      // Degenerate case: every source pool is fully drawn down (zero
      // available volume) at merge time, so there's no real "current stock"
      // to weight by -- fall back to a plain arithmetic mean rather than
      // dividing by zero.
      mergedGhg = batches.reduce((sum, b) => sum.plus(b.ghgValue), D(0)).dividedBy(batches.length);
    }
  } else {
    mergedGhg = batches.reduce((max, b) => (b.ghgValue.greaterThan(max) ? b.ghgValue : max), batches[0].ghgValue);
  }

  const merged = await tx.batch.create({
    data: {
      companyId: params.companyId,
      siteId: batches[0].siteId,
      certScheme: batches[0].certScheme,
      rawMaterial: batches[0].rawMaterial,
      countryOfOrigin: batches[0].countryOfOrigin,
      ghgValue: mergedGhg,
      productType: batches[0].productType,
      unit: batches[0].unit,
      materialCategory: batches[0].materialCategory,
      ghgValueType: batches[0].ghgValueType,
      wasteStatus: batches[0].wasteStatus,
      isMerged: true,
    },
  });

  for (const b of batches) {
    await tx.batchMerge.create({
      data: {
        companyId: params.companyId,
        resultBatchId: merged.id,
        sourceBatchId: b.id,
        contributedVolume: volumes.get(b.id)!,
        sourceGhgValue: b.ghgValue,
      },
    });
  }

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "Batch",
    entityId: merged.id,
    action: "MERGE",
    actor: params.actor,
    beforeValue: JSON.stringify(batches.map((b) => ({ batch: b.id, ghg: b.ghgValue.toString(), volume: volumes.get(b.id)!.toString() }))),
    afterValue:
      ghgMode === "ACTUAL"
        ? `merged_ghg=${mergedGhg} (volume-weighted average of sources)`
        : `merged_ghg=${mergedGhg} (max of sources, not averaged)`,
  });

  return merged;
}

// ---------------------------------------------------------------------------
// Conversions (Processing Unit sites only)
// ---------------------------------------------------------------------------

export async function createConversionEvent(
  tx: Tx,
  params: {
    companyId: number;
    siteId: number;
    periodId: number;
    sourceBatchId: number;
    sourceVolume: Prisma.Decimal.Value;
    conversionFactorCf: Prisma.Decimal.Value;
    conversionDate: Date;
    targetProductType: "BIOMETHANE" | "BIOLNG";
    actor: Actor;
  }
) {
  const site = await tx.site.findFirst({ where: { id: params.siteId, companyId: params.companyId } });
  if (!site) throw new AppError("Site not found.", 404);
  if (site.operatorType !== "PROCESSING_UNIT") {
    throw new ConversionNotAllowedError(
      `Site "${site.name}" is registered as a TRADER. Only PROCESSING_UNIT sites may run conversions.`
    );
  }

  const period = await tx.period.findFirst({ where: { id: params.periodId, companyId: params.companyId } });
  if (!period) throw new AppError("Period not found.", 404);
  if (period.status !== PeriodStatus.OPEN) {
    throw new PeriodClosedError(`Period #${period.id} is CLOSED. Conversions cannot be booked against a closed period.`);
  }

  const sourceBatch = await tx.batch.findFirst({ where: { id: params.sourceBatchId, companyId: params.companyId } });
  if (!sourceBatch) throw new AppError("Source batch not found.", 404);
  if (sourceBatch.productType === params.targetProductType) {
    throw new AppError("Target product type must differ from the source pool's product type.");
  }

  const sourceVolume = D(params.sourceVolume);
  if (sourceVolume.lessThanOrEqualTo(0)) throw new AppError("Source volume must be greater than zero.");
  const cf = D(params.conversionFactorCf);
  if (cf.lessThanOrEqualTo(0)) throw new AppError("Conversion factor must be greater than zero.");

  await lockBatchesForUpdate(tx, params.companyId, [sourceBatch.id]);
  const available = await getBatchAvailableVolume(tx, params.companyId, sourceBatch.id);
  if (sourceVolume.greaterThan(available)) {
    throw new InsufficientStockError(
      `Conversion source volume (${sourceVolume}) exceeds the available balance (${available}) for this stock pool.`
    );
  }

  const resultVolume = sourceVolume.times(cf);

  const targetBatch = await findOrCreateBatch(tx, {
    companyId: params.companyId,
    siteId: params.siteId,
    certScheme: sourceBatch.certScheme,
    rawMaterial: sourceBatch.rawMaterial,
    countryOfOrigin: sourceBatch.countryOfOrigin,
    ghgValue: sourceBatch.ghgValue,
    productType: params.targetProductType,
    // A conversion's output pool carries the same sustainability
    // documentation as its input -- it's the same certified material, just
    // converted to a different product type, not a fresh delivery.
    unit: sourceBatch.unit,
    ghgValueType: sourceBatch.ghgValueType,
    materialCategory: sourceBatch.materialCategory,
    wasteStatus: sourceBatch.wasteStatus,
  });

  const event = await tx.conversionEvent.create({
    data: {
      companyId: params.companyId,
      siteId: params.siteId,
      periodId: params.periodId,
      conversionFactorCf: cf,
      conversionDate: params.conversionDate,
      createdById: params.actor.id,
    },
  });

  const outTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: params.siteId,
      periodId: params.periodId,
      batchId: sourceBatch.id,
      transactionType: TransactionType.CONVERSION_OUT,
      volume: sourceVolume,
      transactionDate: params.conversionDate,
      createdById: params.actor.id,
    },
  });
  const inTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: params.siteId,
      periodId: params.periodId,
      batchId: targetBatch.id,
      transactionType: TransactionType.CONVERSION_IN,
      volume: resultVolume,
      transactionDate: params.conversionDate,
      createdById: params.actor.id,
    },
  });

  await tx.conversionLine.createMany({
    data: [
      { companyId: params.companyId, conversionEventId: event.id, transactionId: outTx.id, role: ConversionRole.INPUT },
      { companyId: params.companyId, conversionEventId: event.id, transactionId: inTx.id, role: ConversionRole.OUTPUT },
    ],
  });

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "ConversionEvent",
    entityId: event.id,
    action: "CREATE",
    actor: params.actor,
    afterValue: `${sourceBatch.productType} ${sourceVolume} -> ${params.targetProductType} ${resultVolume} (CF=${cf})`,
  });

  return { event, sourceTransaction: outTx, targetTransaction: inTx, targetBatch, resultVolume };
}

// ---------------------------------------------------------------------------
// Cross-scheme transfer: ISCC EU -> ISCC PLUS only
// ---------------------------------------------------------------------------

export async function createSchemeTransfer(
  tx: Tx,
  params: {
    companyId: number;
    sourceSiteId: number;
    targetSiteId: number;
    sourceBatchId: number;
    // Both sites need an OPEN period covering the transfer date, the same
    // way a conversion needs one -- the transfer books a real OUTBOUND/
    // INBOUND transaction pair against them (see Transaction.schemeTransferId).
    sourcePeriodId: number;
    targetPeriodId: number;
    volume: Prisma.Decimal.Value;
    transferDate: Date;
    actor: Actor;
  }
) {
  const [sourceSite, targetSite] = await Promise.all([
    tx.site.findFirst({ where: { id: params.sourceSiteId, companyId: params.companyId } }),
    tx.site.findFirst({ where: { id: params.targetSiteId, companyId: params.companyId } }),
  ]);
  if (!sourceSite || !targetSite) throw new AppError("Source or target site not found.", 404);
  if (sourceSite.certScheme !== "ISCC_EU" || targetSite.certScheme !== "ISCC_PLUS") {
    throw new SchemeTransferDirectionError(
      "Certified volume may only move from an ISCC EU site to an ISCC PLUS site, never the reverse."
    );
  }

  const [sourcePeriod, targetPeriod] = await Promise.all([
    tx.period.findFirst({ where: { id: params.sourcePeriodId, companyId: params.companyId, siteId: sourceSite.id } }),
    tx.period.findFirst({ where: { id: params.targetPeriodId, companyId: params.companyId, siteId: targetSite.id } }),
  ]);
  if (!sourcePeriod || !targetPeriod) throw new AppError("Source or target period not found for the selected site.", 404);
  if (sourcePeriod.status !== PeriodStatus.OPEN || targetPeriod.status !== PeriodStatus.OPEN) {
    throw new PeriodClosedError("Both the source and target periods must be OPEN to record a scheme transfer.");
  }

  const sourceBatch = await tx.batch.findFirst({ where: { id: params.sourceBatchId, companyId: params.companyId } });
  if (!sourceBatch || sourceBatch.siteId !== sourceSite.id) {
    throw new AppError("Source batch not found at the source site.", 404);
  }

  const volume = D(params.volume);
  if (volume.lessThanOrEqualTo(0)) throw new AppError("Transfer volume must be greater than zero.");

  await lockBatchesForUpdate(tx, params.companyId, [sourceBatch.id]);
  const available = await getBatchAvailableVolume(tx, params.companyId, sourceBatch.id);
  if (volume.greaterThan(available)) {
    throw new InsufficientStockError(
      `Transfer volume (${volume}) exceeds the available balance (${available}) for this stock pool.`
    );
  }

  const targetBatch = await findOrCreateBatch(tx, {
    companyId: params.companyId,
    siteId: targetSite.id,
    certScheme: "ISCC_PLUS",
    rawMaterial: sourceBatch.rawMaterial,
    countryOfOrigin: sourceBatch.countryOfOrigin,
    ghgValue: sourceBatch.ghgValue,
    productType: sourceBatch.productType,
    // Same certified material, just moved to a PLUS-side pool -- carries
    // the source pool's own sustainability documentation forward.
    unit: sourceBatch.unit,
    ghgValueType: sourceBatch.ghgValueType,
    materialCategory: sourceBatch.materialCategory,
    wasteStatus: sourceBatch.wasteStatus,
  });

  const transfer = await tx.schemeTransfer.create({
    data: {
      companyId: params.companyId,
      sourceSiteId: sourceSite.id,
      targetSiteId: targetSite.id,
      batchId: sourceBatch.id,
      volume,
      transferDate: params.transferDate,
      createdById: params.actor.id,
    },
  });

  // Two linked legs, same shape as a conversion's INPUT/OUTPUT transactions.
  // Neither goes through recordTransaction(): the OUTBOUND leg needs no
  // physical document (Rule 3 only gates genuine external inbound receipts,
  // not an internal book-transfer between the company's own sites), and the
  // INBOUND leg's "document" is the scheme_transfer row itself, traceable
  // via schemeTransferId.
  // Same encrypted column as recordTransaction's counterpartyName -- these
  // synthetic strings go through the same field, so they need the same
  // encryption or a later read of a real-transaction row next to one of
  // these would inconsistently decrypt one and not the other.
  const outCounterparty = `Scheme transfer to ${targetSite.name} (ISCC PLUS)`;
  const inCounterparty = `Scheme transfer from ${sourceSite.name} (ISCC EU)`;
  const outTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: sourceSite.id,
      periodId: sourcePeriod.id,
      batchId: sourceBatch.id,
      transactionType: TransactionType.OUTBOUND,
      volume,
      transactionDate: params.transferDate,
      counterpartyName: encryptField(outCounterparty),
      schemeTransferId: transfer.id,
      createdById: params.actor.id,
    },
  });
  const inTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: targetSite.id,
      periodId: targetPeriod.id,
      batchId: targetBatch.id,
      transactionType: TransactionType.INBOUND,
      volume,
      transactionDate: params.transferDate,
      counterpartyName: encryptField(inCounterparty),
      schemeTransferId: transfer.id,
      createdById: params.actor.id,
    },
  });
  // Return the plaintext values to the caller, not ciphertext.
  outTx.counterpartyName = outCounterparty;
  inTx.counterpartyName = inCounterparty;

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "SchemeTransfer",
    entityId: transfer.id,
    action: "CREATE",
    actor: params.actor,
    afterValue: `EU site ${sourceSite.id} -> PLUS site ${targetSite.id}, volume=${volume}`,
  });

  return { transfer, sourceTransaction: outTx, targetTransaction: inTx, targetBatch };
}

// ---------------------------------------------------------------------------
// B9: PLUS-to-PLUS multi-site credit transfer (client clarification)
// ---------------------------------------------------------------------------

// Only Malaysia's real neighbors are populated here -- the only country
// this project actually has real site data for today (Site.country's
// default). Deliberately not a fabricated worldwide adjacency dataset;
// extend this only with real, verifiable geography as new countries
// actually appear in real site data. Peninsular Malaysia borders Thailand;
// East Malaysia (Sabah/Sarawak) borders Indonesia and Brunei; Singapore is
// separated from Peninsular Malaysia by the narrow Straits of Johor and is
// universally treated as an immediate neighbor despite the strait.
const COUNTRY_NEIGHBORS: Record<string, string[]> = {
  Malaysia: ["Thailand", "Indonesia", "Brunei", "Singapore"],
  Thailand: ["Malaysia"],
  Indonesia: ["Malaysia"],
  Brunei: ["Malaysia"],
  Singapore: ["Malaysia"],
};

function isSameOrNeighboringCountry(a: string, b: string): boolean {
  if (a === b) return true;
  return (COUNTRY_NEIGHBORS[a] ?? []).includes(b);
}

/**
 * Moves certified credits between two sites that are BOTH ISCC_PLUS --
 * distinct from createSchemeTransfer above, which only ever moves EU -> PLUS.
 * Client clarification: gated on the same company (already true -- both
 * sites share companyId), the same or a neighboring country, and the same
 * product type. That last gate is satisfied by construction, not a separate
 * runtime check: exactly like createSchemeTransfer's target pool, the
 * target batch here is found/created via findOrCreateBatch with
 * productType inherited from the source batch, so source and target can
 * never actually diverge on product type -- there is no parameter that
 * could make them differ.
 *
 * Reuses the same SchemeTransfer table and linked-transaction-pair
 * mechanism as createSchemeTransfer (Transaction.schemeTransferId) rather
 * than a parallel model -- a PLUS-to-PLUS transfer is distinguishable from
 * a EU->PLUS one at read time by checking sourceSite.certScheme /
 * targetSite.certScheme, so no extra column is needed for that.
 */
export async function createPlusToPlusTransfer(
  tx: Tx,
  params: {
    companyId: number;
    sourceSiteId: number;
    targetSiteId: number;
    sourceBatchId: number;
    sourcePeriodId: number;
    targetPeriodId: number;
    volume: Prisma.Decimal.Value;
    transferDate: Date;
    actor: Actor;
  }
) {
  const [sourceSite, targetSite] = await Promise.all([
    tx.site.findFirst({ where: { id: params.sourceSiteId, companyId: params.companyId } }),
    tx.site.findFirst({ where: { id: params.targetSiteId, companyId: params.companyId } }),
  ]);
  if (!sourceSite || !targetSite) throw new AppError("Source or target site not found.", 404);
  if (sourceSite.id === targetSite.id) throw new AppError("Source and target site must be different.");
  if (sourceSite.certScheme !== "ISCC_PLUS" || targetSite.certScheme !== "ISCC_PLUS") {
    throw new PlusToPlusTransferNotAllowedError(
      "A PLUS-to-PLUS transfer requires both the source and target site to be certified ISCC_PLUS."
    );
  }
  if (!isSameOrNeighboringCountry(sourceSite.country, targetSite.country)) {
    throw new PlusToPlusTransferNotAllowedError(
      `"${sourceSite.name}" (${sourceSite.country}) and "${targetSite.name}" (${targetSite.country}) are not the ` +
        "same or neighboring countries -- a PLUS-to-PLUS transfer requires one or the other."
    );
  }

  const [sourcePeriod, targetPeriod] = await Promise.all([
    tx.period.findFirst({ where: { id: params.sourcePeriodId, companyId: params.companyId, siteId: sourceSite.id } }),
    tx.period.findFirst({ where: { id: params.targetPeriodId, companyId: params.companyId, siteId: targetSite.id } }),
  ]);
  if (!sourcePeriod || !targetPeriod) throw new AppError("Source or target period not found for the selected site.", 404);
  if (sourcePeriod.status !== PeriodStatus.OPEN || targetPeriod.status !== PeriodStatus.OPEN) {
    throw new PeriodClosedError("Both the source and target periods must be OPEN to record a scheme transfer.");
  }

  const sourceBatch = await tx.batch.findFirst({ where: { id: params.sourceBatchId, companyId: params.companyId } });
  if (!sourceBatch || sourceBatch.siteId !== sourceSite.id) {
    throw new AppError("Source batch not found at the source site.", 404);
  }

  const volume = D(params.volume);
  if (volume.lessThanOrEqualTo(0)) throw new AppError("Transfer volume must be greater than zero.");

  await lockBatchesForUpdate(tx, params.companyId, [sourceBatch.id]);
  const available = await getBatchAvailableVolume(tx, params.companyId, sourceBatch.id);
  if (volume.greaterThan(available)) {
    throw new InsufficientStockError(
      `Transfer volume (${volume}) exceeds the available balance (${available}) for this stock pool.`
    );
  }

  const targetBatch = await findOrCreateBatch(tx, {
    companyId: params.companyId,
    siteId: targetSite.id,
    certScheme: "ISCC_PLUS",
    rawMaterial: sourceBatch.rawMaterial,
    countryOfOrigin: sourceBatch.countryOfOrigin,
    ghgValue: sourceBatch.ghgValue,
    productType: sourceBatch.productType,
    unit: sourceBatch.unit,
    ghgValueType: sourceBatch.ghgValueType,
    materialCategory: sourceBatch.materialCategory,
    wasteStatus: sourceBatch.wasteStatus,
  });

  const transfer = await tx.schemeTransfer.create({
    data: {
      companyId: params.companyId,
      sourceSiteId: sourceSite.id,
      targetSiteId: targetSite.id,
      batchId: sourceBatch.id,
      volume,
      transferDate: params.transferDate,
      createdById: params.actor.id,
    },
  });

  const outCounterparty = `PLUS-to-PLUS transfer to ${targetSite.name} (ISCC PLUS)`;
  const inCounterparty = `PLUS-to-PLUS transfer from ${sourceSite.name} (ISCC PLUS)`;
  const outTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: sourceSite.id,
      periodId: sourcePeriod.id,
      batchId: sourceBatch.id,
      transactionType: TransactionType.OUTBOUND,
      volume,
      transactionDate: params.transferDate,
      counterpartyName: encryptField(outCounterparty),
      schemeTransferId: transfer.id,
      createdById: params.actor.id,
    },
  });
  const inTx = await tx.transaction.create({
    data: {
      companyId: params.companyId,
      siteId: targetSite.id,
      periodId: targetPeriod.id,
      batchId: targetBatch.id,
      transactionType: TransactionType.INBOUND,
      volume,
      transactionDate: params.transferDate,
      counterpartyName: encryptField(inCounterparty),
      schemeTransferId: transfer.id,
      createdById: params.actor.id,
    },
  });
  outTx.counterpartyName = outCounterparty;
  inTx.counterpartyName = inCounterparty;

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "SchemeTransfer",
    entityId: transfer.id,
    action: "CREATE",
    actor: params.actor,
    afterValue: `PLUS site ${sourceSite.id} (${sourceSite.country}) -> PLUS site ${targetSite.id} (${targetSite.country}), volume=${volume}`,
  });

  return { transfer, sourceTransaction: outTx, targetTransaction: inTx, targetBatch };
}

// ---------------------------------------------------------------------------
// Rule 5 + full period close
// ---------------------------------------------------------------------------

export interface ClosePeriodProductInput {
  productType: "BIOMETHANE" | "BIOLNG";
  openingInputInventoryA: Prisma.Decimal.Value;
  // Optional: required at sites that actually run conversions
  // (operatorType = PROCESSING_UNIT); defaults to 1 at a plain TRADER site
  // (client clarification -- CF is only a meaningful, independently-verified
  // figure inside an actual ConversionEvent, not for a site that just moves
  // material in and out with no processing step).
  conversionFactorCf?: Prisma.Decimal.Value;
  // Optional: when omitted, auto-populated from the immediately previous
  // period's own PeriodBalance.creditsCarriedForward for this product type
  // (client clarification -- confirmed this should carry forward
  // automatically rather than be re-typed by hand every close, which is
  // exactly the manual-re-entry mistake this replaces). Still overridable:
  // passing an explicit value here takes precedence.
  openingOutputInventoryB?: Prisma.Decimal.Value;
  ghgValueAssigned: Prisma.Decimal.Value;
}

async function sumTransactions(
  tx: Tx,
  companyId: number,
  periodId: number,
  productType: "BIOMETHANE" | "BIOLNG",
  types: TransactionType[]
): Promise<Prisma.Decimal> {
  const rows = await tx.transaction.findMany({
    where: { companyId, periodId, transactionType: { in: types }, batch: { productType } },
    select: { volume: true },
  });
  return rows.reduce((sum, r) => sum.plus(r.volume), D(0));
}

/**
 * B8: the real carried-forward figure from the immediately previous period's
 * closing, for one product type -- what a new period's opening output
 * inventory should default to rather than be re-typed by hand. Returns 0
 * when there's no previous period, or the previous period never closed a
 * balance for this specific product type (e.g. a site's very first period,
 * or a product type that wasn't in use yet).
 */
async function previousCarriedForward(
  tx: Tx,
  companyId: number,
  previousPeriodId: number | null,
  productType: "BIOMETHANE" | "BIOLNG"
): Promise<Prisma.Decimal> {
  if (!previousPeriodId) return D(0);
  const priorBalance = await tx.periodBalance.findFirst({
    where: { companyId, periodId: previousPeriodId, productType: productType as any },
  });
  return priorBalance ? D(priorBalance.creditsCarriedForward) : D(0);
}

async function latestPhysicalStockTotal(tx: Tx, companyId: number, siteId: number, asOf: Date): Promise<Prisma.Decimal | null> {
  const reading = await tx.physicalStockReading.findFirst({
    where: { companyId, siteId, readingDate: { lte: asOf } },
    orderBy: { readingDate: "desc" },
  });
  if (!reading) return null;
  return D(reading.certifiedStockQty).plus(D(reading.fossilStockQty));
}

export async function closePeriod(
  tx: Tx,
  params: { companyId: number; periodId: number; products: ClosePeriodProductInput[]; actor: Actor }
) {
  if (params.products.length === 0) {
    throw new AppError("Provide the closing inputs for at least one product type.");
  }

  const period = await tx.period.findFirst({
    where: { id: params.periodId, companyId: params.companyId },
    include: { site: true },
  });
  if (!period) throw new AppError("Period not found.", 404);
  if (period.status !== PeriodStatus.OPEN) {
    throw new AppError(`Period #${period.id} is already CLOSED.`);
  }

  const physicalStockTotal = await latestPhysicalStockTotal(tx, params.companyId, period.siteId, period.endDate);

  const results: { productType: string; result: ReturnType<typeof computePeriodBalance> }[] = [];

  // Compute every product-type balance first -- if any one of them breaches
  // Rule 5, nothing gets persisted and the whole close is rejected.
  for (const p of params.products) {
    const incomingA = await sumTransactions(tx, params.companyId, period.id, p.productType, IN_TYPES);
    const outgoingC = await sumTransactions(tx, params.companyId, period.id, p.productType, OUT_TYPES);

    // B6: CF defaults to 1 at a plain TRADER site (not a meaningful,
    // independently-verified figure there); a PROCESSING_UNIT site still
    // must supply it explicitly -- real conversions happened, so the
    // period-level CF is a real admin input, not assumed.
    let conversionFactorCf: Prisma.Decimal;
    if (p.conversionFactorCf !== undefined && p.conversionFactorCf !== null) {
      conversionFactorCf = D(p.conversionFactorCf);
    } else if (period.site.operatorType !== "PROCESSING_UNIT") {
      conversionFactorCf = D(1);
    } else {
      throw new AppError(
        `conversionFactorCf is required for ${p.productType} at "${period.site.name}" -- this site runs conversions ` +
          `(operatorType = PROCESSING_UNIT), so its period-level conversion factor cannot be assumed.`
      );
    }

    // B8: openingOutputInventoryB auto-populates from the previous period's
    // real carried-forward balance for this product type when not supplied
    // (still overridable -- an explicit value always wins).
    let openingOutputInventoryB: Prisma.Decimal;
    if (p.openingOutputInventoryB !== undefined && p.openingOutputInventoryB !== null) {
      openingOutputInventoryB = D(p.openingOutputInventoryB);
    } else {
      openingOutputInventoryB = await previousCarriedForward(tx, params.companyId, period.previousPeriodId, p.productType);
    }

    const result = computePeriodBalance({
      incomingA,
      openingInputInventoryA: D(p.openingInputInventoryA),
      conversionFactorCf,
      openingOutputInventoryB,
      outgoingC,
      certScheme: period.site.certScheme,
      ghgValueAssigned: D(p.ghgValueAssigned),
      physicalStockTotal,
    });
    results.push({ productType: p.productType, result });
  }

  // Two concurrent close attempts on the same period both pass the OPEN
  // check above before either commits. `uq_balance_period_product`
  // (`@@unique([periodId, productType])`) is the real backstop -- catch the
  // loser's violation and turn it into a clean rejection instead of a raw
  // Prisma error.
  for (const { productType, result } of results) {
    try {
      await tx.periodBalance.create({
        data: {
          companyId: params.companyId,
          periodId: period.id,
          productType: productType as any,
          incomingA: result.incomingA,
          openingInputInventoryA: result.openingInputInventoryA,
          conversionFactorCf: result.conversionFactorCf,
          openingOutputInventoryB: result.openingOutputInventoryB,
          totalAvailableB: result.totalAvailableB,
          outgoingC: result.outgoingC,
          closingBalance: result.closingBalance,
          creditsCarriedForward: result.creditsCarriedForward,
          ghgValueAssigned: result.ghgValueAssigned,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new PeriodCloseConflictError(
          `This period is already being closed by another request (a balance for ${productType} was just ` +
            `recorded concurrently). Refresh the period before retrying.`
        );
      }
      throw err;
    }
  }

  await tx.period.update({
    where: { id: period.id },
    data: { status: PeriodStatus.CLOSED, closedAt: new Date(), closedById: params.actor.id },
  });

  const allAlerts: Alert[] = results.flatMap((r) => r.result.alerts);

  await logAudit(tx, {
    companyId: params.companyId,
    entityType: "Period",
    entityId: period.id,
    action: "CLOSE",
    actor: params.actor,
    afterValue: results
      .map(
        (r) =>
          `${r.productType}: B=${r.result.totalAvailableB}, C=${r.result.outgoingC}, closing=${r.result.closingBalance}, ` +
          `carry_forward=${r.result.creditsCarriedForward}`
      )
      .join(" | "),
    notes: allAlerts.length ? allAlerts.map((a) => `[${a.severity}] ${a.message}`).join("; ") : null,
  });

  // Enqueued inside this same transaction: if anything above had rolled
  // back, this row rolls back with it -- no notification for a close that
  // never actually happened.
  await enqueueJob(tx, "PERIOD_CLOSED_NOTIFICATION", {
    companyId: params.companyId,
    periodId: period.id,
    siteId: period.siteId,
  });

  return { period: { ...period, status: PeriodStatus.CLOSED }, results };
}
