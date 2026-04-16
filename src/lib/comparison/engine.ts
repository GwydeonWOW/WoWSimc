import type { SimCCharacterOutput } from "@/lib/simc/parser.types";
import type { TopPlayerAggregate } from "@/types/wow";
import type {
  ComparisonResult,
  ComparisonScore,
  StatComparisonResult,
  GearComparisonSlot,
  Recommendation,
} from "@/types/comparison";
import { GEAR_SLOTS } from "@/types/wow";

const STAT_KEYS = [
  "critRating",
  "hasteRating",
  "masteryRating",
  "versatilityRating",
] as const;

const STAT_LABELS: Record<string, string> = {
  critRating: "Critical Strike",
  hasteRating: "Haste",
  masteryRating: "Mastery",
  versatilityRating: "Versatility",
};

export function compareCharacter(
  character: SimCCharacterOutput,
  aggregate: TopPlayerAggregate,
  contentType: "mythic_plus" | "raid"
): ComparisonResult {
  const stats = compareStats(character, aggregate);
  const gear = compareGear(character, aggregate);
  const scores = calculateScores(stats, gear);
  const recommendations = generateRecommendations(character, aggregate, stats, gear);

  return {
    contentType,
    scores,
    stats,
    gear,
    talents: [], // Will be populated in Phase 2 with talent decoding
    recommendations,
  };
}

function compareStats(
  character: SimCCharacterOutput,
  aggregate: TopPlayerAggregate
): StatComparisonResult[] {
  return STAT_KEYS.map((key) => {
    const userValue = character.stats[key] || 0;
    const statData = aggregate.avgStats[key];

    if (!statData) {
      return {
        stat: STAT_LABELS[key] || key,
        userValue,
        topAvg: 0,
        topP25: 0,
        topP50: 0,
        topP75: 0,
        topP100: 0,
        percentile: 0,
        diff: 0,
        diffPercent: 0,
      };
    }

    const avg = statData.avg || 0;
    const diff = userValue - avg;
    const diffPercent = avg > 0 ? (diff / avg) * 100 : 0;

    // Calculate percentile based on distribution
    let percentile = 50;
    if (statData.p100 > statData.p25) {
      if (userValue >= statData.p100) percentile = 100;
      else if (userValue >= statData.p75) percentile = 75 + ((userValue - statData.p75) / (statData.p100 - statData.p75)) * 25;
      else if (userValue >= statData.p50) percentile = 50 + ((userValue - statData.p50) / (statData.p75 - statData.p50)) * 25;
      else if (userValue >= statData.p25) percentile = 25 + ((userValue - statData.p25) / (statData.p50 - statData.p25)) * 25;
      else percentile = (userValue / statData.p25) * 25;
    }

    return {
      stat: STAT_LABELS[key] || key,
      userValue,
      topAvg: avg,
      topP25: statData.p25,
      topP50: statData.p50,
      topP75: statData.p75,
      topP100: statData.p100,
      percentile: Math.max(0, Math.min(100, percentile)),
      diff,
      diffPercent,
    };
  });
}

function compareGear(
  character: SimCCharacterOutput,
  aggregate: TopPlayerAggregate
): GearComparisonSlot[] {
  return GEAR_SLOTS.map((slot) => {
    const userItem = character.gear[slot] || null;
    const topItems = aggregate.gearPopularity[slot] || [];

    let score = 0;
    let isMatch = false;
    let isUpgrade = false;

    if (!userItem) {
      return { slot, userItem: null, topItems, score: 0, isMatch: false, isUpgrade: false };
    }

    const topItem = topItems[0];

    if (topItem && userItem.itemId === topItem.itemId) {
      score = 100;
      isMatch = true;
    } else {
      // Check if user's item is in top-5
      const rank = topItems.findIndex((ti) => ti.itemId === userItem.itemId);
      if (rank >= 0 && rank < 5) {
        score = 95 - rank * 5;
        isMatch = true;
      } else {
        // Score based on ilvl proximity
        const topAvgIlvl = topItem?.avgIlvl || 0;
        const ilvlDiff = topAvgIlvl - userItem.ilvl;
        if (ilvlDiff <= 0) {
          score = 75; // Higher ilvl but different item
        } else if (ilvlDiff <= 3) {
          score = 65;
        } else if (ilvlDiff <= 6) {
          score = 50;
        } else {
          score = 30;
          isUpgrade = true;
        }
      }
    }

    return { slot, userItem, topItems, score, isMatch, isUpgrade };
  });
}

function calculateScores(
  stats: StatComparisonResult[],
  gear: GearComparisonSlot[]
): ComparisonScore {
  const statScore = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.percentile, 0) / stats.length)
    : 0;

  const gearScore = gear.length > 0
    ? Math.round(gear.reduce((sum, g) => sum + g.score, 0) / gear.length)
    : 0;

  const talentScore = 0; // Phase 2
  const enchantScore = 0; // Phase 2

  const overall = Math.round(
    statScore * 0.2 + gearScore * 0.35 + talentScore * 0.25 + enchantScore * 0.2
  );

  return {
    stats: statScore,
    gear: gearScore,
    talents: talentScore,
    enchants: enchantScore,
    overall,
  };
}

function generateRecommendations(
  character: SimCCharacterOutput,
  aggregate: TopPlayerAggregate,
  stats: StatComparisonResult[],
  gear: GearComparisonSlot[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Stat recommendations
  for (const stat of stats) {
    if (stat.diffPercent < -10) {
      recommendations.push({
        type: "stat",
        severity: stat.diffPercent < -20 ? "high" : "medium",
        message: `Tu ${stat.stat} esta ${Math.abs(stat.diffPercent).toFixed(1)}% por debajo del promedio de top players (${stat.userValue} vs ${stat.topAvg})`,
        currentValue: stat.userValue.toString(),
        recommendedValue: stat.topAvg.toString(),
      });
    }
  }

  // Gear recommendations
  const sortedGear = [...gear].sort((a, b) => a.score - b.score);
  for (const g of sortedGear.slice(0, 5)) {
    if (g.score < 60 && g.topItems.length > 0) {
      const topItem = g.topItems[0];
      recommendations.push({
        type: "gear",
        severity: g.score < 40 ? "high" : "medium",
        slot: g.slot,
        message: `Tu ${g.slot} es el slot mas debil (score: ${g.score}). Top players usan ${topItem.name} (ilvl ${topItem.avgIlvl}, ${(topItem.popularity * 100).toFixed(0)}% popularidad)`,
        currentValue: g.userItem ? `ilvl ${g.userItem.ilvl}` : "Sin item",
        recommendedValue: `${topItem.name} (ilvl ${topItem.avgIlvl})`,
      });
    }
  }

  // Missing enchants
  for (const slot of GEAR_SLOTS) {
    const userItem = character.gear[slot];
    if (userItem && !userItem.enchantId) {
      const enchantData = aggregate.enchantPopularity[slot];
      if (enchantData && enchantData.length > 0) {
        recommendations.push({
          type: "enchant",
          severity: "low",
          slot,
          message: `Tu ${slot} no tiene encanto. Top players usan enchant ID ${enchantData[0].enchantId}`,
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return recommendations;
}
