/**
 * Seeds the real two-company structure this app actually represents (not a
 * single generic "demo company" -- see PRODUCT.md "Evidence on Hand" for
 * the correction that led here):
 *
 *   - ALS Solutions: the platform operator ("Your client -- can see all
 *     companies" per Database Schema.pdf's user_role note). Home of the
 *     SUPER_ADMIN user. Has no sites/operational data of its own -- it
 *     oversees other companies' data, it doesn't produce any itself.
 *   - Kian Hoe Plantations Berhad (KHPB): the actual client company, home
 *     of the COMPANY_ADMIN/COMPANY_USER users and every site/batch/period
 *     this app has real or seeded data for.
 *
 * Registration numbers for both are placeholders (`PENDING-REGISTRATION`)
 * pending the real numbers -- do the same for every future company created
 * here or anywhere else rather than inventing a plausible-looking fake one.
 *
 * NOTE: SUPER_ADMIN's cross-company reach is not implemented yet (every
 * route still filters by the requester's own companyId regardless of
 * role -- see PRODUCT.md). That means `superadmin@demo.local`, now
 * correctly homed at ALS (which has no sites/data of its own), will see an
 * empty app until that feature is built. This is accurate, not a bug: ALS
 * doesn't have its own operational data, it's meant to see KHPB's (and
 * later, other clients') once cross-company oversight exists.
 *
 * Safe to re-run: upserts by unique email/locationId/name rather than
 * blindly inserting duplicates.
 */
import { PrismaClient, UserRole, CertScheme, OperatorType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PLACEHOLDER_REG_NUMBER = "PENDING-REGISTRATION";

// Company.name isn't a unique column in the schema, so this upserts "by
// hand" (find, then create-if-missing) rather than using prisma.upsert,
// which requires a real unique/id where-clause.
async function findOrCreateCompany(name: string): Promise<{ id: number; name: string }> {
  const existing = await prisma.company.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.company.create({ data: { name, registrationNumber: PLACEHOLDER_REG_NUMBER } });
}

async function main() {
  const als = await findOrCreateCompany("ALS Solutions");
  const khpb = await findOrCreateCompany("Kian Hoe Plantations Berhad");

  const password = "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 10);

  const users = [
    { email: "superadmin@demo.local", name: "Iqman (Super Admin)", role: UserRole.SUPER_ADMIN, companyId: als.id },
    { email: "admin@demo.local", name: "Aisyah (Company Admin)", role: UserRole.COMPANY_ADMIN, companyId: khpb.id },
    { email: "entry@demo.local", name: "Ravi (Company User)", role: UserRole.COMPANY_USER, companyId: khpb.id },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { companyId: u.companyId },
      create: { ...u, passwordHash },
    });
  }

  // KHPB Trading Terminal: a genuinely separate real operation (trades
  // EU-scheme material, not the Biomethane Plant's own production) --
  // confirmed with the client 2026-08-25, not the same site as the plant
  // below. No real certificate supplied for it yet, so its certificate
  // fields stay null (openNewPeriod applies no extra bound until one is on
  // file -- see schema.prisma's comment on Site's certificate fields).
  await prisma.site.upsert({
    where: { locationId: "KHPB-TRADER-01" },
    update: {},
    create: {
      companyId: khpb.id,
      name: "KHPB Trading Terminal",
      locationId: "KHPB-TRADER-01",
      certScheme: CertScheme.ISCC_EU,
      operatorType: OperatorType.TRADER,
      multiSiteBalancingEnabled: false,
      defaultPeriodLengthMonths: 3,
    },
  });

  // The Biomethane Plant is dual-certified: one physical site holding both
  // an ISCC PLUS and an ISCC EU certificate at once (confirmed with the
  // client 2026-08-25). Site.certScheme is single-valued and used
  // throughout the engine (EU-cap-vs-PLUS-uncapped carry-forward, scheme
  // transfer direction checks), so this needs two Site rows sharing the
  // same physical plant rather than one -- the same pattern already used to
  // separate the Trading Terminal above from this plant. Real certificate
  // data below is sourced directly from References/ISCC PLUS CERTIFICATE.pdf
  // and References/ISCC EU CERTIFICATE.pdf, not placeholders.
  await prisma.site.upsert({
    where: { locationId: "KHPB-PU-01" },
    update: {
      certificateNumber: "ISCC-PLUS-Cert-DE105-90342502",
      certifyingBody: "Control Union Certifications Germany GmbH",
      certifiedFrom: new Date("2025-09-24"),
      certifiedTo: new Date("2026-09-23"),
      certifiedSiteRoles: "Biomethane plant, Biogas Plant, Point of Origin",
    },
    create: {
      companyId: khpb.id,
      name: "KHPB Biomethane Plant",
      locationId: "KHPB-PU-01",
      certScheme: CertScheme.ISCC_PLUS,
      operatorType: OperatorType.PROCESSING_UNIT,
      multiSiteBalancingEnabled: false,
      defaultPeriodLengthMonths: 3,
      certificateNumber: "ISCC-PLUS-Cert-DE105-90342502",
      certifyingBody: "Control Union Certifications Germany GmbH",
      certifiedFrom: new Date("2025-09-24"),
      certifiedTo: new Date("2026-09-23"),
      certifiedSiteRoles: "Biomethane plant, Biogas Plant, Point of Origin",
    },
  });

  await prisma.site.upsert({
    where: { locationId: "KHPB-PU-01-EU" },
    update: {
      certificateNumber: "EU-ISCC-Cert-ID250-65446910",
      certifyingBody: "PT. Qualitas Sertifikasi Indonesia",
      certifiedFrom: new Date("2026-06-26"),
      certifiedTo: new Date("2027-06-25"),
      certifiedSiteRoles: "Point of Origin, Biogas plant, Biomethane plant",
    },
    create: {
      companyId: khpb.id,
      name: "KHPB Biomethane Plant (EU)",
      locationId: "KHPB-PU-01-EU",
      certScheme: CertScheme.ISCC_EU,
      operatorType: OperatorType.PROCESSING_UNIT,
      multiSiteBalancingEnabled: false,
      defaultPeriodLengthMonths: 3,
      certificateNumber: "EU-ISCC-Cert-ID250-65446910",
      certifyingBody: "PT. Qualitas Sertifikasi Indonesia",
      certifiedFrom: new Date("2026-06-26"),
      certifiedTo: new Date("2027-06-25"),
      certifiedSiteRoles: "Point of Origin, Biogas plant, Biomethane plant",
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  console.log(`Companies: ${als.name} (id=${als.id}), ${khpb.name} (id=${khpb.id})`);
  console.log(`Log in with any of:`);
  for (const u of users) console.log(`  ${u.email}  /  ${password}  (${u.role}, company=${u.companyId === als.id ? als.name : khpb.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
