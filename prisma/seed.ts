import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Verifying database connection...");

  // Test that we can connect and query
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("Database connection verified:", result);

  console.log("Seed complete. No mock data created.");
  console.log("Use POST /api/sync to populate real data from Raider.IO + Blizzard APIs.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
