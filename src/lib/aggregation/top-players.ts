import { fetchMurlokData } from "@/lib/api/murlok";
import { prisma } from "@/lib/db";
import { CURRENT_SEASON, GEAR_SLOTS } from "@/types/wow";
import type { WoWRegion } from "@/types/wow";

const STAT_NAME_MAP: Record<string, string> = {
  "Critical Strike": "critRating",
  Haste: "hasteRating",
  Mastery: "masteryRating",
  Versatility: "versatilityRating",
};

/**
 * Fetch aggregated top-player data from murlok.io and upsert to DB
 */
export async function syncForSpec(
  classSlug: string,
  specSlug: string,
  contentType: "mythic_plus" | "raid",
  _region: WoWRegion = "eu",
  season: string = CURRENT_SEASON
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];

  // Step 1: Fetch data from murlok.io
  let murlokData;
  try {
    murlokData = await fetchMurlokData(classSlug, specSlug, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Murlok fetch failed: ${msg}`);
    return { synced: 0, errors };
  }

  if (!murlokData.stats || murlokData.stats.length === 0) {
    errors.push("No stats found in murlok data");
    return { synced: 0, errors };
  }

  // Step 2: Transform murlok data into DB format

  // Avg stats - use rating values from murlok (these are averages of top 50 players)
  const avgStats: Record<string, { avg: number; p25: number; p50: number; p75: number; p100: number }> = {};
  for (const stat of murlokData.stats) {
    const key = STAT_NAME_MAP[stat.name];
    if (key) {
      // Murlok provides the average. We use the rating as the avg and derive rough percentiles.
      // Since we only have the average, we approximate p25/p50/p75/p100 around it.
      avgStats[key] = {
        avg: stat.rating,
        p25: Math.round(stat.rating * 0.85),
        p50: stat.rating,
        p75: Math.round(stat.rating * 1.15),
        p100: Math.round(stat.rating * 1.3),
      };
    }
  }

  // Stat priority from murlok's ordered list
  const statPriority = murlokData.statPriority.map(
    (name) => STAT_NAME_MAP[name] || name
  );

  // Gear popularity - convert murlok player counts to percentages
  const gearPopularity: Record<
    string,
    { itemId: number; name: string; popularity: number; avgIlvl: number }[]
  > = {};
  const totalPlayers = murlokData.playerCount || 50;

  for (const slot of GEAR_SLOTS) {
    const items = murlokData.gear[slot];
    if (items && items.length > 0) {
      gearPopularity[slot] = items
        .slice(0, 10)
        .map((item) => ({
          itemId: item.itemId,
          name: item.name,
          popularity: Math.round((item.playerCount / totalPlayers) * 100) / 100,
          avgIlvl: 0, // Murlok doesn't provide avg ilvl per item
        }));
    }
  }

  // Enchant popularity
  const enchantPopularity: Record<string, { enchantId: number; popularity: number }[]> = {};
  for (const slot of GEAR_SLOTS) {
    const entries = murlokData.enchants[slot];
    if (entries && entries.length > 0) {
      enchantPopularity[slot] = entries
        .slice(0, 5)
        .map((entry) => ({
          // Murlok doesn't provide enchant IDs, use a hash of the name as placeholder
          enchantId: hashString(entry.name),
          popularity: Math.round((entry.playerCount / totalPlayers) * 100) / 100,
        }));
    }
  }

  // Gem popularity
  const gemPopularity = murlokData.gems.slice(0, 10).map((gem) => ({
    gemId: gem.itemId,
    popularity: Math.round((gem.playerCount / totalPlayers) * 100) / 100,
  }));

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
      playerCount: totalPlayers,
    },
    update: {
      avgStats,
      statPriority,
      gearPopularity,
      enchantPopularity,
      gemPopularity,
      playerCount: totalPlayers,
    },
  });

  return { synced: totalPlayers, errors };
}

/**
 * Simple string hash to generate a numeric ID for enchant names
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
