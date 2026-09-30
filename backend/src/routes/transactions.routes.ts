import { Router } from "express";
import { z } from "zod";
import { UserRole, CertScheme, ProductType, GhgValueType, WasteStatus, Unit } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { findOrCreateBatch, recordTransaction, READ_COMMITTED } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";
import { withRetry } from "../lib/retry";
import { decryptField, encryptField } from "../lib/fieldEncryption";
import { idempotent } from "../middleware/idempotency";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

/** counterpartyName/counterpartyCertNumber (on the transaction itself) and
 * issuedBy/fileReference (on its linked physicalDocument, if any) are all
 * encrypted at rest -- see fieldEncryption.ts. */
function withDecryptedFields<
  T extends {
    counterpartyName: string | null;
    counterpartyCertNumber: string | null;
    physicalDocument?: { issuedBy: string | null; fileReference: string | null } | null;
  }
>(t: T): T {
  return {
    ...t,
    counterpartyName: decryptField(t.counterpartyName) ?? null,
    counterpartyCertNumber: decryptField(t.counterpartyCertNumber) ?? null,
    physicalDocument: t.physicalDocument
      ? { ...t.physicalDocument, issuedBy: decryptField(t.physicalDocument.issuedBy) ?? null, fileReference: decryptField(t.physicalDocument.fileReference) ?? null }
      : t.physicalDocument,
  };
}

/** Transaction log: every INBOUND/OUTBOUND/CONVERSION_* row, newest first.
 * Nothing in this system ever updates or deletes a posted transaction --
 * that immutability is what makes the audit trail meaningful. Mistakes are
 * corrected with an offsetting entry, the same way a ledger would be. */
transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { siteId, periodId, batchId } = req.query;
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    if (siteId) assertSiteAccessible(accessible, Number(siteId));
    const transactions = await prisma.transaction.findMany({
      where: {
        companyId: req.user!.companyId,
        siteId: siteId ? Number(siteId) : siteIdFilter(accessible),
        periodId: periodId ? Number(periodId) : undefined,
        batchId: batchId ? Number(batchId) : undefined,
      },
      include: { batch: true, site: true, physicalDocument: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { transactionDate: "desc" },
      take: 500,
    });
    res.json(transactions.map(withDecryptedFields));
  })
);

const baseFields = {
  siteId: z.number().int(),
  periodId: z.number().int(),
  volume: z.coerce.number().positive(),
  transactionDate: z.coerce.date(),
  counterpartyName: z.string().optional(),
  counterpartyCertNumber: z.string().optional(),
};

// Scheme-dependent controlled vocabulary for Batch.materialCategory (client
// clarification + the updated ISCC EU/PLUS material lists in References/) --
// EU and PLUS genuinely use different category wording, not variants of one
// shared list, so which set applies depends on the sibling certScheme field.
const EU_MATERIAL_CATEGORIES = [
  "Annex IX Part A Feedstocks",
  "Annex IX Part B Feedstocks",
  "Other / Unclassified Sustainable Feedstocks",
  "Waste & Residues",
] as const;
const PLUS_MATERIAL_CATEGORIES = ["Bio", "Bio-Circular", "Circular", "Renewable energy-derived"] as const;

// A plain z.object (not wrapped in .superRefine) -- z.discriminatedUnion
// below requires each branch to be a bare ZodObject so it can inspect the
// literal discriminator. The certScheme/materialCategory/wasteStatus
// cross-field checks are applied via .superRefine on the union as a whole
// instead (see createTransactionSchema).
const inboundSchema = z.object({
  ...baseFields,
  transactionType: z.literal("INBOUND"),
  productType: z.nativeEnum(ProductType),
  certScheme: z.nativeEnum(CertScheme),
  rawMaterial: z.string().min(1),
  countryOfOrigin: z.string().min(1),
  ghgValue: z.coerce.number(),
  ghgValueType: z.nativeEnum(GhgValueType),
  materialCategory: z.string().min(1),
  // Required only when materialCategory = "Bio-Circular" -- checked below,
  // not here, since that depends on the sibling materialCategory field.
  wasteStatus: z.nativeEnum(WasteStatus).optional(),
  unit: z.nativeEnum(Unit),
  physicalDocumentId: z.number().int().optional(),
  physicalDocument: z
    .object({
      documentType: z.enum(["WEIGHBRIDGE_TICKET", "DELIVERY_NOTE"]),
      documentNumber: z.string().min(1),
      documentDate: z.coerce.date(),
      issuedBy: z.string().optional(),
    })
    .optional(),
});

const outboundSchema = z.object({
  ...baseFields,
  transactionType: z.literal("OUTBOUND"),
  batchId: z.number().int(),
});

const createTransactionSchema = z
  .discriminatedUnion("transactionType", [inboundSchema, outboundSchema])
  .superRefine((data, ctx) => {
    if (data.transactionType !== "INBOUND") return;
    const validCategories = data.certScheme === "ISCC_EU" ? EU_MATERIAL_CATEGORIES : PLUS_MATERIAL_CATEGORIES;
    if (!(validCategories as readonly string[]).includes(data.materialCategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["materialCategory"],
        message: `Invalid material category for ${data.certScheme}. Must be one of: ${validCategories.join(", ")}.`,
      });
    }
    if (data.materialCategory === "Bio-Circular" && !data.wasteStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wasteStatus"],
        message: "wasteStatus is required for Bio-Circular material.",
      });
    }
  });

transactionsRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  idempotent(),
  asyncHandler(async (req, res) => {
    const data = createTransactionSchema.parse(req.body);
    const actor = { id: req.user!.userId, name: req.user!.name };
    const companyId = req.user!.companyId;
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), data.siteId);

    const transaction = await withRetry(() => prisma.$transaction(async (tx) => {
      let batchId: number;
      let physicalDocumentId: number | undefined;

      if (data.transactionType === "INBOUND") {
        const batch = await findOrCreateBatch(tx, {
          companyId,
          siteId: data.siteId,
          certScheme: data.certScheme,
          rawMaterial: data.rawMaterial,
          countryOfOrigin: data.countryOfOrigin,
          ghgValue: data.ghgValue,
          productType: data.productType,
          unit: data.unit,
          ghgValueType: data.ghgValueType,
          materialCategory: data.materialCategory,
          wasteStatus: data.wasteStatus ?? null,
        });
        batchId = batch.id;

        if (data.physicalDocumentId) {
          physicalDocumentId = data.physicalDocumentId;
        } else if (data.physicalDocument) {
          const doc = await tx.physicalDocument.create({
            data: {
              ...data.physicalDocument,
              // No fileReference field on this inline-creation path (only
              // the standalone POST /documents route accepts one).
              issuedBy: encryptField(data.physicalDocument.issuedBy ?? null),
              companyId,
            },
          });
          physicalDocumentId = doc.id;
        } else {
          throw new AppError(
            "Inbound transactions require a weighbridge ticket or delivery note: either supply physicalDocumentId or physicalDocument."
          );
        }
      } else {
        const batch = await tx.batch.findFirst({ where: { id: data.batchId, companyId } });
        if (!batch) throw new AppError("Selected stock pool not found.", 404);
        batchId = batch.id;
      }

      return recordTransaction(tx, {
        companyId,
        siteId: data.siteId,
        periodId: data.periodId,
        batchId,
        transactionType: data.transactionType,
        volume: data.volume,
        transactionDate: data.transactionDate,
        counterpartyName: data.counterpartyName,
        counterpartyCertNumber: data.counterpartyCertNumber,
        physicalDocumentId,
        actor,
      });
    }, READ_COMMITTED));

    const full = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      include: { batch: true, site: true, physicalDocument: true },
    });
    await getCache().delete(dashboardCacheKey(companyId));
    res.status(201).json(full ? withDecryptedFields(full) : full);
  })
);
