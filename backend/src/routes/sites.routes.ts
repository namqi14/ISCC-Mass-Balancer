import { Router } from "express";
import multer from "multer";
import { supabase } from "../lib/supabase";
import pdfParse from "pdf-parse";
import { z } from "zod";
import { UserRole, CertScheme, OperatorType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { logAudit } from "../lib/massBalanceEngine";
import { AppError } from "../lib/errors";
import { getCache } from "../lib/cache";
import { dashboardCacheKey } from "./dashboard.routes";
import { getAccessibleSiteIds, assertSiteAccessible, siteIdFilter } from "../lib/siteAccess";

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

sitesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const accessible = await getAccessibleSiteIds(req.user!.userId);
    const sites = await prisma.site.findMany({
      where: { companyId: req.user!.companyId, id: siteIdFilter(accessible) },
      orderBy: { name: "asc" },
    });
    res.json(sites);
  })
);

sitesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const site = await prisma.site.findFirst({ where: { id: Number(req.params.id), companyId: req.user!.companyId } });
    if (!site) throw new AppError("Site not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), site.id);
    res.json(site);
  })
);

const createSiteSchema = z.object({
  name: z.string().min(1),
  locationId: z.string().min(1),
  certScheme: z.nativeEnum(CertScheme),
  operatorType: z.nativeEnum(OperatorType).default(OperatorType.TRADER),
  multiSiteBalancingEnabled: z.boolean().default(false),
  defaultPeriodLengthMonths: z.number().int().min(1).max(3).default(3),
  // Needed for the PLUS-to-PLUS scheme transfer's same/neighboring-country
  // check -- optional here, Prisma applies its own "Malaysia" default when
  // omitted (see schema.prisma's comment on Site.country).
  country: z.string().min(1).optional(),
  // The site's real ISCC certificate -- all optional, since a site may not
  // have one on file yet (see schema.prisma's comment on these fields).
  // certifiedFrom/certifiedTo together bound what period dates openNewPeriod
  // will accept for this site.
  certificateNumber: z.string().max(100).optional(),
  certifyingBody: z.string().max(300).optional(),
  certifiedFrom: z.coerce.date().optional(),
  certifiedTo: z.coerce.date().optional(),
  certifiedSiteRoles: z.string().max(300).optional(),
  // Set by the frontend from POST /sites/parse-certificate's response --
  // that route already saved the file and returns its path; this just
  // records it against the site once the form is actually submitted. Same
  // unvalidated-path-string trust model as PhysicalDocument.fileReference.
  certificateFileUrl: z.string().max(500).optional(),
});

sitesRouter.post(
  "/",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_USER),
  asyncHandler(async (req, res) => {
    // A site-scoped admin ("Certification Executive") manages only their
    // assigned sites -- creating a brand-new site is a company-wide action
    // reserved for an unrestricted admin ("Top Level/Certification Manager").
    if ((await getAccessibleSiteIds(req.user!.userId)) !== null) {
      throw new AppError("Creating a new site requires unrestricted company access.", 403, "SITE_ACCESS_DENIED");
    }

    // Client clarification (2026-08-25): a COMPANY_ADMIN can only create as
    // many sites as SUPER_ADMIN has assigned their company -- a null
    // maxSites means no cap has been set yet (unlimited), matching the same
    // nullable-means-unconstrained convention as Site.certifiedFrom/To.
    const company = await prisma.company.findUnique({ where: { id: req.user!.companyId } });
    if (company?.maxSites !== null && company?.maxSites !== undefined) {
      const existingSiteCount = await prisma.site.count({ where: { companyId: req.user!.companyId } });
      if (existingSiteCount >= company.maxSites) {
        throw new AppError(
          `Your company is limited to ${company.maxSites} site${company.maxSites === 1 ? "" : "s"} (currently has ` +
            `${existingSiteCount}). Contact ALS Solutions to raise this limit before adding another.`,
          403,
          "SITE_QUOTA_EXCEEDED"
        );
      }
    }

    const data = createSiteSchema.parse(req.body);
    const site = await prisma.site.create({ data: { ...data, companyId: req.user!.companyId } });
    await logAudit(prisma, {
      companyId: req.user!.companyId,
      entityType: "Site",
      entityId: site.id,
      action: "CREATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      afterValue: `name=${site.name}, scheme=${site.certScheme}, operatorType=${site.operatorType}`,
    });
    await getCache().delete(dashboardCacheKey(req.user!.companyId)); // siteCount changed
    res.status(201).json(site);
  })
);

// ---------------------------------------------------------------------------
// Certificate autofill: upload a site's ISCC certificate PDF and get its
// certificate fields back to prefill the New/Edit site form. Saves the PDF
// regardless of extraction outcome (client clarification, 2026-08-26 -- the
// certificate should stay on file the same way a company logo does), but
// never writes to a Site row itself: this works identically whether the
// caller is mid-creating a brand-new site (no id yet) or editing an existing
// one. The returned certificateFileUrl and certificate fields are only
// actually persisted when the form is submitted via POST/PATCH above, same
// as every other field on that form.
//
// Extraction is local text-pattern matching (pdf-parse), not AI/OCR -- no
// external API, no API key, no cost, nothing leaves this server. This works
// because ISCC issues every certificate against one fixed template
// regardless of certifying body: confirmed against the two real reference
// certificates in References/ISCC EU CERTIFICATE.pdf and References/ISCC
// PLUS CERTIFICATE.pdf, issued by two unrelated certifying bodies (PT.
// Qualitas Sertifikasi Indonesia; Control Union Certifications Germany GmbH)
// that nonetheless share identical anchor phrasing ("Certificate Number:",
// "This certificate is valid from ... to ...", "The site of the system user
// is certified as:"). Only works on PDFs with a real text layer -- a
// scanned/photographed certificate has none, and extraction will find
// nothing (client clarification, 2026-08-27 -- traded AI/vision's broader
// format coverage for zero cost and no external dependency, given both real
// certificates on file are text PDFs).
// ---------------------------------------------------------------------------

const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB -- real samples are 200-330KB; headroom for scanned certificates
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new AppError("Certificate must be a PDF file.", 400));
      return;
    }
    cb(null, true);
  },
});

interface ExtractedCertificateFields {
  certificateNumber: string | null;
  certifyingBody: string | null;
  certifiedFrom: string | null; // YYYY-MM-DD
  certifiedTo: string | null; // YYYY-MM-DD
  certifiedSiteRoles: string | null;
  certScheme: CertScheme | null;
}

function ddmmyyyyToIso(d: string): string {
  const [dd, mm, yyyy] = d.split(".");
  return `${yyyy}-${mm}-${dd}`;
}

function extractCertificateFields(rawText: string): ExtractedCertificateFields {
  const lines = rawText.split("\n").map((l) => l.trim());

  const certNumberMatch = rawText.match(/Certificate Number:\s*(.+)/i);
  const certificateNumber = certNumberMatch ? certNumberMatch[1].trim() : null;

  // The certifying body's name is always the first non-blank line right
  // after "Certificate Number: ..." (its address follows, then "certifies
  // that") -- true in both real reference certificates despite unrelated
  // issuers and different templates otherwise.
  let certifyingBody: string | null = null;
  const certNumberLineIdx = lines.findIndex((l) => /^Certificate Number:/i.test(l));
  if (certNumberLineIdx !== -1) {
    for (let i = certNumberLineIdx + 1; i < lines.length; i++) {
      if (lines[i]) {
        certifyingBody = lines[i];
        break;
      }
    }
  }

  const validityMatch = rawText.match(/valid from\s+(\d{2}\.\d{2}\.\d{4})\s+to\s+(\d{2}\.\d{2}\.\d{4})/i);
  const certifiedFrom = validityMatch ? ddmmyyyyToIso(validityMatch[1]) : null;
  const certifiedTo = validityMatch ? ddmmyyyyToIso(validityMatch[2]) : null;

  // Roles are the lines between "...certified as:" and whichever comes
  // first: a blank line (EU template), a known following-section heading
  // (PLUS template has no blank line before "The scope of the
  // certificate..."), or the "<City>, <date>" issue line as a last resort.
  let certifiedSiteRoles: string | null = null;
  const rolesHeaderIdx = lines.findIndex((l) => /^The site of the system user is certified as:$/i.test(l));
  if (rolesHeaderIdx !== -1) {
    const roles: string[] = [];
    for (let i = rolesHeaderIdx + 1; i < lines.length && roles.length < 8; i++) {
      const line = lines[i];
      if (!line) break;
      if (/^The scope of the certificate/i.test(line)) break;
      if (/^Place and date of issue/i.test(line)) break;
      if (/^[A-Za-z .'-]+,\s*\d{2}\.\d{2}\.\d{4}$/.test(line)) break;
      roles.push(line);
    }
    if (roles.length) certifiedSiteRoles = roles.join(", ");
  }

  const certScheme: CertScheme | null = /ISCC\s*PLUS/i.test(rawText)
    ? CertScheme.ISCC_PLUS
    : /ISCC\s*EU/i.test(rawText)
    ? CertScheme.ISCC_EU
    : null;

  return { certificateNumber, certifyingBody, certifiedFrom, certifiedTo, certifiedSiteRoles, certScheme };
}

sitesRouter.post(
  "/parse-certificate",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  certificateUpload.single("certificate"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError("No certificate file uploaded (expected multipart field 'certificate').", 400);

    const filename = `${req.user!.companyId}-${Date.now()}.pdf`;

    const { error } = await supabase.storage
      .from("certificates")
      .upload(filename, req.file.buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (error) {
      throw new AppError(`Failed to upload certificate: ${error.message}`, 500);
    }

    const { data: { publicUrl } } = supabase.storage.from("certificates").getPublicUrl(filename);
    const certificateFileUrl = publicUrl;

    const { text } = await pdfParse(req.file.buffer);
    const extracted = extractCertificateFields(text);

    const foundAnything =
      extracted.certificateNumber || extracted.certifiedFrom || extracted.certifiedTo || extracted.certifiedSiteRoles;
    if (!foundAnything) {
      throw new AppError(
        "Could not read certificate data from this PDF -- it may be a scanned image without selectable text. Please fill in the fields manually.",
        422,
        "CERTIFICATE_EXTRACTION_FAILED"
      );
    }

    res.json({ certificateFileUrl, ...extracted });
  })
);

const updateSiteSchema = createSiteSchema.partial();

sitesRouter.patch(
  "/:id",
  requireRole(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.site.findFirst({ where: { id, companyId: req.user!.companyId } });
    if (!existing) throw new AppError("Site not found.", 404);
    assertSiteAccessible(await getAccessibleSiteIds(req.user!.userId), id);
    const data = updateSiteSchema.parse(req.body);
    const site = await prisma.site.update({ where: { id }, data });
    await logAudit(prisma, {
      companyId: req.user!.companyId,
      entityType: "Site",
      entityId: site.id,
      action: "UPDATE",
      actor: { id: req.user!.userId, name: req.user!.name },
      beforeValue: JSON.stringify(existing),
      afterValue: JSON.stringify(site),
    });
    await getCache().delete(dashboardCacheKey(req.user!.companyId)); // recentAudit changed, at minimum
    res.json(site);
  })
);
