import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export const auditLogRouter = Router();
auditLogRouter.use(requireAuth);

/** Read-only for everyone (including AUDITOR). There is intentionally no
 * PATCH/DELETE route anywhere in this file or in the AuditLogEntry model --
 * application code only ever INSERTs into the audit log (see logAudit in
 * lib/massBalanceEngine.ts), matching the append-only design from
 * References/models.py. */
auditLogRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.query;
    const entries = await prisma.auditLogEntry.findMany({
      where: {
        companyId: req.user!.companyId,
        entityType: entityType ? String(entityType) : undefined,
        entityId: entityId ? Number(entityId) : undefined,
      },
      orderBy: { timestamp: "desc" },
      take: 1000,
    });
    res.json(entries);
  })
);
