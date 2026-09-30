/**
 * Optional, second seed pass that populates the KHPB Biomethane Plant site
 * with REAL production figures taken from
 * References/Appendix 5 - KHPB ISCC PLUS Mass Balance (MB) Worksheet (2024-2025) (1).xlsx
 * (sheet "Monthly (2024-2025)", the "ISCC" sub-column of each metric group).
 *
 * Run `npm run seed` first (creates the company/users/sites), then:
 *   npm run seed:khpb
 *
 * ---------------------------------------------------------------------------
 * How the source worksheet maps onto this app's schema (read this before
 * trusting the numbers for anything beyond a demo):
 *
 * The worksheet tracks KHPB's internal biogas engineering pipeline in far
 * more detail than an ISCC mass-balance LEDGER needs to record: daily
 * opening biogas stock -> incoming POME to the digester -> biogas generated
 * -> split across scrubber / gas engine / biomethane plant -> CH4 content
 * -> biomethane generated -> biomethane supplied to the grid, each split
 * into ISCC-certified vs. non-certified sub-totals, in m3 (and separately
 * in GJ/MMBtu for the grid-supply figure). That routing detail is plant
 * SCADA data that FEEDS an ISCC declaration; it isn't itself an ISCC ledger
 * entry, and this schema (deliberately, matching References/models.py)
 * doesn't model a three-stage internal conversion chain -- only inbound,
 * outbound, and a single-step Biomethane<->BioLNG conversion.
 *
 * So this script compresses the pipeline to the two events an ISCC mass
 * balance ledger actually books, using the worksheet's own ISCC-column
 * totals month by month:
 *   - INBOUND: that month's "Biomethane Generated (m3)" [ISCC] -- the
 *     sustainable material entering the balance.
 *   - OUTBOUND: that month's "Biomethane Supplied to Grid (m3)" [ISCC] --
 *     the sustainable material leaving it.
 *
 * Two things are NOT in this worksheet and are placeholders here, clearly
 * flagged -- do not treat them as audited figures:
 *   - GHG intensity (gCO2eq/MJ): Appendix 5 doesn't report it. The real
 *     figure lives in the ISCC Sustainability Declaration (Appendix 12a/b).
 *   - Units are carried through as plain m3 volumes; this schema has no
 *     unit column, so GJ/MMBtu conversion (the worksheet's own 1.05506
 *     factor) is not applied here.
 *
 * The worksheet has daily data for Sep 2024 - May 2025 (9 months; Jun-Aug
 * 2025 are blank in the source file) which happens to split cleanly into
 * three continuous 3-month periods -- exactly this app's period-length cap.
 * Period 2 and 3 carry forward the previous period's ISCC PLUS credit
 * balance as their opening output inventory (b), demonstrating multi-period
 * carry-forward with real cumulative volumes.
 */
import { PrismaClient } from "@prisma/client";
import { openNewPeriod, recordTransaction, closePeriod } from "../src/lib/massBalanceEngine";

const prisma = new PrismaClient();

// Source: "Monthly (2024-2025)" sheet, ISCC sub-column, rows for each month.
// [monthLabel, endDate, biomethaneGeneratedIsccM3, biomethaneSuppliedToGridIsccM3]
const MONTHS: [string, string, number, number][] = [
  ["Sep-2024", "2024-09-30", 72777, 63951],
  ["Oct-2024", "2024-10-31", 234032, 112757],
  ["Nov-2024", "2024-11-30", 431595, 237987],
  ["Dec-2024", "2024-12-31", 363662, 159515],
  ["Jan-2025", "2025-01-31", 275769, 64274],
  ["Feb-2025", "2025-02-28", 122122, 40499],
  ["Mar-2025", "2025-03-31", 301336, 78244],
  ["Apr-2025", "2025-04-30", 300273, 78004],
  ["May-2025", "2025-05-31", 300273, 155628],
];

// Three continuous 3-month periods covering the 9 months above.
const PERIODS = [
  { start: "2024-09-01", end: "2024-11-30", months: MONTHS.slice(0, 3) },
  { start: "2024-12-01", end: "2025-02-28", months: MONTHS.slice(3, 6) },
  { start: "2025-03-01", end: "2025-05-31", months: MONTHS.slice(6, 9) },
];

const GHG_PLACEHOLDER = 10.0; // NOT from Appendix 5 -- see file header comment.

async function main() {
  const company = await prisma.company.findFirst({ where: { name: "Kian Hoe Plantations Berhad" } });
  if (!company) throw new Error("Run `npm run seed` first to create the Kian Hoe Plantations Berhad (KHPB) company.");

  const site = await prisma.site.findUnique({ where: { locationId: "KHPB-PU-01" } });
  if (!site) throw new Error("Run `npm run seed` first to create the KHPB Biomethane Plant site.");

  const admin = await prisma.user.findUnique({ where: { email: "admin@demo.local" } });
  if (!admin) throw new Error("Run `npm run seed` first to create the demo users.");
  const actor = { id: admin.id, name: admin.name };

  const alreadySeeded = await prisma.period.findFirst({ where: { siteId: site.id } });
  if (alreadySeeded) {
    console.log("KHPB site already has periods booked -- skipping (this script is not meant to run twice).");
    return;
  }

  let carryForward = 0;

  for (const p of PERIODS) {
    const period = await openNewPeriod(prisma, {
      companyId: company.id,
      siteId: site.id,
      startDate: new Date(p.start),
      endDate: new Date(p.end),
      actor,
    });
    console.log(`Opened period #${period.id}: ${p.start} to ${p.end}`);

    for (const [label, endDate, generated, suppliedToGrid] of p.months) {
      const doc = await prisma.physicalDocument.create({
        data: {
          companyId: company.id,
          documentType: "DELIVERY_NOTE",
          documentNumber: `KHPB-MB-${label}`,
          documentDate: new Date(endDate),
          issuedBy: "KHPB internal production record",
          fileReference:
            "Derived from References/Appendix 5 (KHPB ISCC PLUS MB Worksheet 2024-2025), " +
            "sheet 'Monthly (2024-2025)', ISCC column. GHG value is a PLACEHOLDER, not sourced " +
            "from this worksheet -- see the site's Appendix 12a/12b Sustainability Declaration.",
        },
      });

      const batch = await prisma.batch.findFirst({
        where: {
          companyId: company.id,
          siteId: site.id,
          certScheme: "ISCC_PLUS",
          rawMaterial: "Palm Oil Mill Effluent (POME)",
          countryOfOrigin: "Malaysia",
          productType: "BIOMETHANE",
          isMerged: false,
        },
      });

      const inbound = await recordTransaction(prisma, {
        companyId: company.id,
        siteId: site.id,
        periodId: period.id,
        batchId:
          batch?.id ??
          (
            await prisma.batch.create({
              data: {
                companyId: company.id,
                siteId: site.id,
                certScheme: "ISCC_PLUS",
                rawMaterial: "Palm Oil Mill Effluent (POME)",
                countryOfOrigin: "Malaysia",
                ghgValue: GHG_PLACEHOLDER,
                productType: "BIOMETHANE",
              },
            })
          ).id,
        transactionType: "INBOUND",
        volume: generated,
        transactionDate: new Date(endDate),
        counterpartyName: "KHPB Digester / Biomethane Plant (internal)",
        physicalDocumentId: doc.id,
        actor,
      });

      await recordTransaction(prisma, {
        companyId: company.id,
        siteId: site.id,
        periodId: period.id,
        batchId: inbound.batchId,
        transactionType: "OUTBOUND",
        volume: suppliedToGrid,
        transactionDate: new Date(endDate),
        counterpartyName: "Gas Malaysia grid (national gas network)",
        actor,
      });

      console.log(`  ${label}: +${generated} m3 in, -${suppliedToGrid} m3 to grid`);
    }

    const { results } = await closePeriod(prisma, {
      companyId: company.id,
      periodId: period.id,
      products: [
        {
          productType: "BIOMETHANE",
          openingInputInventoryA: 0,
          conversionFactorCf: 1,
          openingOutputInventoryB: carryForward,
          ghgValueAssigned: GHG_PLACEHOLDER,
        },
      ],
      actor,
    });
    const bm = results[0].result;
    carryForward = Number(bm.creditsCarriedForward);
    console.log(
      `Closed period #${period.id}: B=${bm.totalAvailableB} C=${bm.outgoingC} closing=${bm.closingBalance} ` +
        `carryForward=${bm.creditsCarriedForward}`
    );
  }

  console.log("\nKHPB seed complete. Log in as admin@demo.local and check the Periods & Close and Pools & Balances pages.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
