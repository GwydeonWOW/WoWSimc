import { fetchArchonData } from "@/lib/api/archon";
import { prisma } from "@/lib/db";
import { CURRENT_SEASON, GEAR_SLOTS } from "@/types/wow";
import type { WoWRegion } from "@/types/wow";

const STAT_NAME_MAP: Record<string, string> = {
  Crit: "critRating",
  "Critical Strike": "critRating",
  Haste: "hasteRating",
  Mastery: "masteryRating",
  Vers: "versatilityRating",
  Versatility: "versatilityRating",
};

/**
 * Fetch aggregated top-player data from archon.gg and upsert to DB.
 * Archon.gg provides data based on tens of thousands of parses (not just top 50).
 */
export async function syncForSpec(
  classSlug: string,
  specSlug: string,
  contentType: "mythic_plus" | "raid",
  _region: WoWRegion = "eu",
  season: string = CURRENT_SEASON
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];

  // Step 1: Fetch data from archon.gg
  let archonData;
  try {
    archonData = await fetchArchonData(classSlug, specSlug, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Archon.gg fetch failed: ${msg}`);
    return { synced: 0, errors };
  }

  if (!archonData.stats || archonData.stats.length === 0) {
    errors.push("No stats found in archon.gg data");
    return { synced: 0, errors };
  }

  // Step 2: Transform archon data into DB format

  // Avg stats - archon provides 95th percentile lower bound averages
  const avgStats: Record<string, { avg: number; p25: number; p50: number; p75: number; p100: number }> = {};
  for (const stat of archonData.stats) {
    const key = STAT_NAME_MAP[stat.name];
    if (key && stat.rating > 0) {
      avgStats[key] = {
        avg: stat.rating,
        p25: Math.round(stat.rating * 0.85),
        p50: stat.rating,
        p75: Math.round(stat.rating * 1.15),
        p100: Math.round(stat.rating * 1.3),
      };
    }
  }

  // Stat priority from archon's ordered list
  const statPriority = archonData.statPriority
    .map((name) => STAT_NAME_MAP[name] || name)
    .filter((key) => key);

  // Gear popularity - archon provides popularity % and parse counts
  const gearPopularity: Record<
    string,
    { itemId: number; name: string; popularity: number; avgIlvl: number }[]
  > = {};

  // Process gear slots
  const allGearItems = [...archonData.gear, ...archonData.weapons, ...archonData.trinkets];
  for (const item of allGearItems) {
    const slot = item.slot;
    if (!gearPopularity[slot]) {
      gearPopularity[slot] = [];
    }
    gearPopularity[slot].push({
      itemId: item.itemId,
      name: item.name,
      popularity: item.popularity / 100, // Convert % to decimal
      avgIlvl: 0, // Archon doesn't provide avg ilvl per item
    });
  }

  // Sort each slot by popularity
  for (const slot of Object.keys(gearPopularity)) {
    gearPopularity[slot].sort((a, b) => b.popularity - a.popularity);
  }

  // Enchant popularity - extract from gear items
  const enchantPopularity: Record<string, { enchantId: number; popularity: number }[]> = {};
  for (const item of allGearItems) {
    if (item.enchants.length > 0) {
      const slot = item.slot;
      if (!enchantPopularity[slot]) {
        enchantPopularity[slot] = [];
      }
      for (const enchant of item.enchants) {
        enchantPopularity[slot].push({
          enchantId: enchant.id,
          popularity: item.popularity / 100,
        });
      }
    }
  }

  // Deduplicate enchants (keep highest popularity per enchant ID per slot)
  for (const slot of Object.keys(enchantPopularity)) {
    const seen = new Map<number, number>();
    enchantPopularity[slot] = enchantPopularity[slot].filter((e) => {
      const existing = seen.get(e.enchantId);
      if (existing !== undefined && existing >= e.popularity) return false;
      seen.set(e.enchantId, e.popularity);
      return true;
    }).sort((a, b) => b.popularity - a.popularity).slice(0, 5);
  }

  // Gem popularity - extract from gear items
  const gemMap = new Map<number, { popularity: number; name: string }>();
  for (const item of allGearItems) {
    for (const gem of item.gems) {
      const existing = gemMap.get(gem.id);
      const newPop = item.popularity / 100;
      if (!existing || existing.popularity < newPop) {
        gemMap.set(gem.id, { popularity: newPop, name: gem.name });
      }
    }
  }
  const gemPopularity = Array.from(gemMap.entries())
    .map(([gemId, data]) => ({ gemId, popularity: data.popularity }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);

  // Step 3: Upsert to DB
  await prisma.topPlayerAggregate.upsert({
    where: {
      classSlug_specSlug_contentType_season: { classSlug, specSlug, contentType, season },
    },
    create: {
      classSlug,
      specSlug,
      contentType,
      season,
      topTalentBuild: "",
      talentPickRates: {},
      avgStats,
      statPriority,
      gearPopularity,
      enchantPopularity,
      gemPopularity,
      playerCount: archonData.totalParses,
    },
    update: {
      avgStats,
      statPriority,
      gearPopularity,
      enchantPopularity,
      gemPopularity,
      playerCount: archonData.totalParses,
    },
  });

  return { synced: archonData.totalParses, errors };
}
