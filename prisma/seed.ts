import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inline class/spec data to avoid importing from src/ in production
const CLASS_DATA = [
  { slug: "deathknight", specs: ["blood", "frost", "unholy"] },
  { slug: "demonhunter", specs: ["havoc", "vengeance"] },
  { slug: "druid", specs: ["balance", "feral", "guardian", "restoration"] },
  { slug: "evoker", specs: ["devastation", "preservation", "augmentation"] },
  { slug: "hunter", specs: ["beastmastery", "marksmanship", "survival"] },
  { slug: "mage", specs: ["arcane", "fire", "frost"] },
  { slug: "monk", specs: ["brewmaster", "mistweaver", "windwalker"] },
  { slug: "paladin", specs: ["holy", "protection", "retribution"] },
  { slug: "priest", specs: ["discipline", "holy", "shadow"] },
  { slug: "rogue", specs: ["assassination", "outlaw", "subtlety"] },
  { slug: "shaman", specs: ["elemental", "enhancement", "restoration"] },
  { slug: "warlock", specs: ["affliction", "demonology", "destruction"] },
  { slug: "warrior", specs: ["arms", "fury", "protection"] },
];

const GEAR_SLOTS = [
  "head", "neck", "shoulder", "back", "chest", "wrist", "hands",
  "waist", "legs", "feet", "finger1", "finger2", "trinket1", "trinket2",
  "main_hand", "off_hand",
];

const ENCHANTABLE_SLOTS = [
  "head", "shoulder", "chest", "wrist", "legs", "feet",
  "finger1", "finger2", "main_hand", "back",
];

async function main() {
  console.log("Seeding top player aggregate data...");

  const season = "season-tww-3";

  for (const cls of CLASS_DATA) {
    for (const specSlug of cls.specs) {
      for (const contentType of ["mythic_plus", "raid"]) {
        const avgStats = {
          critRating: { avg: 8000 + Math.random() * 2000, p25: 6500, p50: 8000, p75: 9500, p100: 12000 },
          hasteRating: { avg: 7000 + Math.random() * 1500, p25: 5500, p50: 7000, p75: 8500, p100: 10000 },
          masteryRating: { avg: 6000 + Math.random() * 2000, p25: 4500, p50: 6000, p75: 7500, p100: 9500 },
          versatilityRating: { avg: 5000 + Math.random() * 1500, p25: 3500, p50: 5000, p75: 6500, p100: 8000 },
        };

        const statPriority = ["haste", "mastery", "versatility", "crit"];

        const gearPopularity: Record<string, { itemId: number; name: string; popularity: number; avgIlvl: number }[]> = {};
        for (const slot of GEAR_SLOTS) {
          gearPopularity[slot] = [
            { itemId: 220000 + Math.floor(Math.random() * 1000), name: `Top ${slot} Item`, popularity: 0.72, avgIlvl: 636 },
            { itemId: 221000 + Math.floor(Math.random() * 1000), name: `Alt ${slot} Item 1`, popularity: 0.15, avgIlvl: 633 },
            { itemId: 222000 + Math.floor(Math.random() * 1000), name: `Alt ${slot} Item 2`, popularity: 0.08, avgIlvl: 630 },
          ];
        }

        const enchantPopularity: Record<string, { enchantId: number; popularity: number }[]> = {};
        for (const slot of ENCHANTABLE_SLOTS) {
          enchantPopularity[slot] = [
            { enchantId: 8700 + Math.floor(Math.random() * 100), popularity: 0.85 },
            { enchantId: 8800 + Math.floor(Math.random() * 100), popularity: 0.10 },
          ];
        }

        await prisma.topPlayerAggregate.upsert({
          where: {
            classSlug_specSlug_contentType_season: {
              classSlug: cls.slug,
              specSlug,
              contentType,
              season,
            },
          },
          create: {
            classSlug: cls.slug,
            specSlug,
            contentType,
            season,
            topTalentBuild: "BQABAAAAAAAAAAAAAAAA",
            talentPickRates: {},
            avgStats,
            statPriority,
            gearPopularity,
            enchantPopularity,
            gemPopularity: [
              { gemId: 213904, popularity: 0.65 },
              { gemId: 213778, popularity: 0.25 },
            ],
            playerCount: 50,
          },
          update: {
            avgStats,
            statPriority,
            gearPopularity,
            enchantPopularity,
          },
        });

        console.log(`  Seeded: ${cls.slug}/${specSlug}/${contentType}`);
      }
    }
  }

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
