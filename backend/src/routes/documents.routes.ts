import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { encryptField, decryptField } from "../lib/fieldEncryption";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

/** issuedBy/fileReference are encrypted at rest (see fieldEncryption.ts);
 * documentNumber is not (it's @unique -- see that file's header comment). */
function withDecryptedFields<T extends { issuedBy: string | null; fileReference: string | null }>(doc: T): T {
  return { ...doc, issuedBy: decryptField(doc.issuedBy) ?? null, fileReference: decryptField(doc.fileReference) ?? null };
}

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const documents = await prisma.physicalDocument.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { documentDate: "desc" },
    });
    res.json(documents.map(withDecryptedFields));
  })
);

const createDocSchema = z.object({
  documentType: z.enum(["WEIGHBRIDGE_TICKET", "DELIVERY_NOTE"]),
  documentNumber: z.string().min(1),
  documentDate: z.coerce.date(),
  issuedBy: z.string().optional(),
  fileReference: z.string().optional(),
});

documentsRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  asyncHandler(async (req, res) => {
    const data = createDocSchema.parse(req.body);
    const doc = await prisma.physicalDocument.create({
      data: {
        ...data,
        issuedBy: encryptField(data.issuedBy ?? null),
        fileReference: encryptField(data.fileReference ?? null),
        companyId: req.user!.companyId,
      },
    });
    res.status(201).json({ ...doc, issuedBy: data.issuedBy ?? null, fileReference: data.fileReference ?? null });
  })
);
