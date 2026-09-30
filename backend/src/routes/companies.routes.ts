import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { logAudit } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";

/**
 * Company account management.
 *
 * Two distinct access patterns share this router:
 * - SUPER_ADMIN-only, any company by id (`GET /`, `POST /`, `PATCH /:id`):
 *   the multi-tenant onboarding mechanism (client clarification,
 *   2026-08-25) -- ALS Solutions manually onboards each paying client
 *   company, sets their site quota, and activates/deactivates access.
 *   Deliberately does NOT give SUPER_ADMIN visibility into another
 *   company's operational data (batches, transactions, periods) --
 *   confirmed with the client as explicitly out of scope. Every other
 *   route in this backend still filters strictly by companyId regardless
 *   of role; this is the one deliberate, narrow exception, and only for
 *   account-management fields, never a company's real mass-balance records.
 * - COMPANY_ADMIN self-service, always the caller's own company (`GET /me`,
 *   `PATCH /me`, `POST /me/logo`): the Company Profile module (client
 *   clarification, 2026-08-26) -- lets a company fill in its own identity
 *   (name, registration number, address, contact details, logo) without
 *   needing SUPER_ADMIN. `isActive`/`maxSites` stay SUPER_ADMIN-only (surfaced
 *   read-only via `GET /me` so a company can see its own quota usage, per
 *   the "contact ALS to raise this limit" flow in sites.routes.ts, but never
 *   accepted by `PATCH /me`).
 */
export const companiesRouter = Router();
companiesRouter.use(requireAuth);

const PLACEHOLDER_REG_NUMBER = "PENDING-REGISTRATION";

// ---------------------------------------------------------------------------
// COMPANY_ADMIN self-service: Company Profile (always req.user!.companyId --
// never an arbitrary id, so no cross-company access is possible regardless
// of role). Registered before the SUPER_ADMIN /:id routes so Express never
// treats the literal path "/me" as :id = "me".
// ---------------------------------------------------------------------------

companiesRouter.get(
  "/me",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
    if (!company) throw new AppError("Company not found.", 404);
    res.json(company);
  })
);

const updateMyCompanySchema = z.object({
  name: z.string().min(1).optional(),
  registrationNumber: z.string().min(1).optional(),
  address: z.string().max(500).optional(),
  contactName: z.string().max(200).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().optional(),
});

companiesRouter.patch(
  "/me",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    // Deliberately a separate, narrower schema than PATCH /:id below --
    // isActive/maxSites/logoUrl are not accepted here at all, not just
    // ignored, so this endpoint can never be used to self-grant them.
    const data = updateMyCompanySchema.parse(req.body);
    const existing = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
    if (!existing) throw new AppError("Company not found.", 404);
    const company = await prisma.company.update({ where: { id: req.user!.companyId }, data });
    await logAudit(prisma, {
      companyId: company.id,
      entityType: "Company",
      entityId: company.id,
      action: "UPDATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      beforeValue: JSON.stringify(existing),
      afterValue: JSON.stringify(company),
      notes: "Company Profile self-service update",
    });
    res.json(company);
  })
);

const LOGO_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (!LOGO_MIME_TO_EXT[file.mimetype]) {
      cb(new AppError("Logo must be a PNG, JPEG, WEBP, or SVG image.", 400));
      return;
    }
    cb(null, true);
  },
});

companiesRouter.post(
  "/me/logo",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  logoUpload.single("logo"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("No logo file uploaded (expected multipart field 'logo').", 400);

    const ext = LOGO_MIME_TO_EXT[req.file.mimetype] ?? "bin";
    const filename = `${req.user!.companyId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("logos")
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (error) {
      throw new AppError(`Failed to upload logo: ${error.message}`, 500);
    }

    const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(filename);
    const logoUrl = publicUrl;

    const company = await prisma.company.update({ where: { id: req.user!.companyId }, data: { logoUrl } });
    await logAudit(prisma, {
      companyId: company.id,
      entityType: "Company",
      entityId: company.id,
      action: "UPDATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      notes: `Logo uploaded: ${logoUrl}`,
    });
    res.status(201).json({ logoUrl });
  })
);

// ---------------------------------------------------------------------------
// SUPER_ADMIN-only: any company by id.
// ---------------------------------------------------------------------------

companiesRouter.get(
  "/",
  requireRole(UserRole.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        isActive: true,
        maxSites: true,
        createdAt: true,
        _count: { select: { sites: true, users: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        registrationNumber: c.registrationNumber,
        isActive: c.isActive,
        maxSites: c.maxSites,
        createdAt: c.createdAt,
        siteCount: c._count.sites,
        userCount: c._count.users,
      }))
    );
  })
);

const createCompanySchema = z.object({
  name: z.string().min(1),
  // Placeholder convention established this project (2026-08-22): a real
  // registration number is filled in later, never a fabricated
  // plausible-looking one.
  registrationNumber: z.string().min(1).optional(),
  maxSites: z.number().int().min(0).optional(),
});

companiesRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = createCompanySchema.parse(req.body);
    const company = await prisma.company.create({
      data: {
        name: data.name,
        registrationNumber: data.registrationNumber ?? PLACEHOLDER_REG_NUMBER,
        maxSites: data.maxSites,
      },
    });
    await logAudit(prisma, {
      companyId: company.id,
      entityType: "Company",
      entityId: company.id,
      action: "CREATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      afterValue: `name=${company.name}, maxSites=${company.maxSites ?? "unlimited"}`,
    });
    res.status(201).json(company);
  })
);

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  registrationNumber: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  maxSites: z.number().int().min(0).nullable().optional(),
});

companiesRouter.patch(
  "/:id",
  requireRole(UserRole.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) throw new AppError("Company not found.", 404);
    const data = updateCompanySchema.parse(req.body);
    const company = await prisma.company.update({ where: { id }, data });
    await logAudit(prisma, {
      companyId: company.id,
      entityType: "Company",
      entityId: company.id,
      action: "UPDATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      beforeValue: JSON.stringify(existing),
      afterValue: JSON.stringify(company),
    });
    res.json(company);
  })
);
