import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting deletion...");
  
  await prisma.auditLogEntry.deleteMany({});
  console.log("Deleted audit logs");
  
  await prisma.periodBalance.deleteMany({});
  console.log("Deleted period balances");
  
  await prisma.conversionLine.deleteMany({});
  console.log("Deleted conversion lines");
  
  await prisma.conversionEvent.deleteMany({});
  console.log("Deleted conversion events");
  
  await prisma.schemeTransfer.deleteMany({});
  console.log("Deleted scheme transfers");
  
  await prisma.transaction.deleteMany({});
  console.log("Deleted transactions");
  
  await prisma.batchMerge.deleteMany({});
  console.log("Deleted batch merges");
  
  await prisma.batch.deleteMany({});
  console.log("Deleted batches");
  
  await prisma.physicalStockReading.deleteMany({});
  console.log("Deleted physical stock readings");
  
  await prisma.physicalDocument.deleteMany({});
  console.log("Deleted physical documents");
  
  await prisma.period.deleteMany({});
  console.log("Deleted periods");
  
  await prisma.userSiteAccess.deleteMany({});
  console.log("Deleted user site access");
  
  await prisma.site.deleteMany({});
  console.log("Deleted sites");
  
  console.log("Deletion complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
