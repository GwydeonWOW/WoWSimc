import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Verifying database connection...");

  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("Database connection verified:", result);

  // Clean old mock/stale data
  const deleted = await prisma.topPlayerAggregate.deleteMany({});
  console.log(`Deleted ${deleted.count} old TopPlayerAggregate records.`);

  console.log("Seed complete. Use POST /api/sync to populate real data from murlok.io.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
