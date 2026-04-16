import { getRaiderIOClient } from "@/lib/api/raiderio";
import { getBlizzardClient } from "@/lib/api/blizzard";
import { prisma } from "@/lib/db";
import { CURRENT_SEASON, GEAR_SLOTS } from "@/types/wow";
import type { WoWRegion } from "@/types/wow";

const ENCHANTABLE_SLOTS = [
  "head", "shoulder", "chest", "wrist", "legs", "feet",
  "finger1", "finger2", "main_hand", "back",
];

const STAT_KEYS = ["critRating", "hasteRating", "masteryRating", "versatilityRating"] as const;

interface RawPlayerData {
  name: string;
  realm: string;
  stats: Record<string, number>;
  gear: Record<string, { itemId: number; name: string; ilvl: number; enchantId?: number; gemIds?: number[] }>;
}

/**
 * Fetch top player rankings and sync aggregated data for a class/spec
 */
export async function syncForSpec(
  classSlug: string,
  specSlug: string,
  contentType: "mythic_plus" | "raid",
  region: WoWRegion = "eu",
  season: string = CURRENT_SEASON
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];

  // Step 1: Get top player rankings
  let playerList: { name: string; realm: string }[] = [];

  try {
    if (contentType === "mythic_plus") {
      const rankings = await getRaiderIOClient().getMythicPlusRankings(region, classSlug, specSlug, season);
      playerList = rankings.rankings.slice(0, 50).map((r) => ({
        name: r.character.name,
        realm: r.character.realm,
      }));
    } else {
      // Raid: For MVP, use Raider.IO character leaderboard as proxy
      // TODO: Replace with Warcraft Logs API for proper raid rankings
      const rankings = await getRaiderIOClient().getMythicPlusRankings(region, classSlug, specSlug, season);
      playerList = rankings.rankings.slice(0, 50).map((r) => ({
        name: r.character.name,
        realm: r.character.realm,
      }));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Rankings fetch failed: ${msg}`);
    return { synced: 0, errors };
  }

  if (playerList.length === 0) {
    errors.push("No players found in rankings");
    return { synced: 0, errors };
  }

  // Step 2: Fetch detailed data for each player from Blizzard API
  const client = getBlizzardClient(region);
  const rawData: RawPlayerData[] = [];

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < playerList.length; i += 5) {
    const batch = playerList.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const [statsRes, equipRes] = await Promise.all([
          client.getCharacterStats(p.realm, p.name).catch(() => null),
          client.getCharacterEquipment(p.realm, p.name).catch(() => null),
        ]);

        const stats: Record<string, number> = {};
        if (statsRes) {
          const critData = statsRes.spell_crit || statsRes.melee_crit;
          const hasteData = statsRes.spell_haste || statsRes.melee_haste;
          stats.critRating = critData?.rating_normalized || 0;
          stats.hasteRating = hasteData?.rating_normalized || 0;
          stats.masteryRating = statsRes.mastery?.rating_normalized || 0;
          stats.versatilityRating = typeof statsRes.versatility === "number" ? statsRes.versatility : 0;
        }

        const gear: RawPlayerData["gear"] = {};
        if (equipRes?.equipped_items) {
          for (const item of equipRes.equipped_items) {
            const slot = item.slot?.type?.toLowerCase()?.replace(" ", "_") ?? "";
            if (slot && GEAR_SLOTS.includes(slot as typeof GEAR_SLOTS[number])) {
              gear[slot] = {
                itemId: item.item.id,
                name: item.item.name,
                ilvl: item.level.value,
                enchantId: item.enchantments?.[0]?.enchantment_id,
                gemIds: item.gems?.map((g: { item: { id: number } }) => g.item.id),
              };
            }
          }
        }

        return { name: p.name, realm: p.realm, stats, gear } as RawPlayerData;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        rawData.push(r.value);
      }
    }

    // Small delay between batches to be gentle on the API
    if (i + 5 < playerList.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (rawData.length === 0) {
    errors.push("Could not fetch data for any players");
    return { synced: 0, errors };
  }

  // Step 3: Aggregate
  const aggregated = aggregatePlayerData(rawData);

  // Step 4: Upsert to DB
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
      avgStats: aggregated.avgStats,
      statPriority: aggregated.statPriority,
      gearPopularity: aggregated.gearPopularity,
      enchantPopularity: aggregated.enchantPopularity,
      gemPopularity: aggregated.gemPopularity,
      playerCount: rawData.length,
    },
    update: {
      avgStats: aggregated.avgStats,
      statPriority: aggregated.statPriority,
      gearPopularity: aggregated.gearPopularity,
      enchantPopularity: aggregated.enchantPopularity,
      gemPopularity: aggregated.gemPopularity,
      playerCount: rawData.length,
    },
  });

  return { synced: rawData.length, errors };
}

/**
 * Aggregate raw player data into statistical distributions
 */
function aggregatePlayerData(players: RawPlayerData[]) {
  // Stats aggregation
  const avgStats: Record<string, { avg: number; p25: number; p50: number; p75: number; p100: number }> = {};

  for (const key of STAT_KEYS) {
    const values = players.map((p) => p.stats[key] || 0).sort((a, b) => a - b);
    const len = values.length;
    avgStats[key] = {
      avg: Math.round(values.reduce((s, v) => s + v, 0) / len),
      p25: values[Math.floor(0.25 * len)] || 0,
      p50: values[Math.floor(0.5 * len)] || 0,
      p75: values[Math.floor(0.75 * len)] || 0,
      p100: values[len - 1] || 0,
    };
  }

  // Stat priority (highest avg first)
  const statPriority = [...STAT_KEYS].sort((a, b) => (avgStats[b]?.avg || 0) - (avgStats[a]?.avg || 0));

  // Gear popularity
  const gearPopularity: Record<string, { itemId: number; name: string; popularity: number; avgIlvl: number }[]> = {};
  for (const slot of GEAR_SLOTS) {
    const itemMap = new Map<number, { name: string; count: number; totalIlvl: number }>();
    for (const p of players) {
      const item = p.gear[slot];
      if (item) {
        const existing = itemMap.get(item.itemId) || { name: item.name, count: 0, totalIlvl: 0 };
        existing.count++;
        existing.totalIlvl += item.ilvl;
        itemMap.set(item.itemId, existing);
      }
    }
    gearPopularity[slot] = Array.from(itemMap.entries())
      .map(([itemId, data]) => ({
        itemId,
        name: data.name,
        popularity: Math.round((data.count / players.length) * 100) / 100,
        avgIlvl: Math.round(data.totalIlvl / data.count),
      }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 10);
  }

  // Enchant popularity
  const enchantPopularity: Record<string, { enchantId: number; popularity: number }[]> = {};
  for (const slot of ENCHANTABLE_SLOTS) {
    const enchantMap = new Map<number, number>();
    let total = 0;
    for (const p of players) {
      const item = p.gear[slot];
      if (item?.enchantId) {
        enchantMap.set(item.enchantId, (enchantMap.get(item.enchantId) || 0) + 1);
        total++;
      }
    }
    enchantPopularity[slot] = Array.from(enchantMap.entries())
      .map(([enchantId, count]) => ({
        enchantId,
        popularity: total > 0 ? Math.round((count / players.length) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 5);
  }

  // Gem popularity
  const gemMap = new Map<number, number>();
  for (const p of players) {
    for (const slot of GEAR_SLOTS) {
      const item = p.gear[slot];
      if (item?.gemIds) {
        for (const gemId of item.gemIds) {
          gemMap.set(gemId, (gemMap.get(gemId) || 0) + 1);
        }
      }
    }
  }
  const gemPopularity = Array.from(gemMap.entries())
    .map(([gemId, count]) => ({
      gemId,
      popularity: Math.round((count / players.length) * 100) / 100,
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);

  return { avgStats, statPriority, gearPopularity, enchantPopularity, gemPopularity };
}
