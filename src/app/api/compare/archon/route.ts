import { NextResponse } from "next/server";
import { fetchArchonData } from "@/lib/api/archon";
import { syncForSpec } from "@/lib/aggregation/top-players";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const classSlug = searchParams.get("classSlug");
  const specSlug = searchParams.get("specSlug");
  const contentType = searchParams.get("contentType") || "mythic_plus";
  const encounter = searchParams.get("encounter");
  const listEncounters = searchParams.get("listEncounters") === "true";

  if (!classSlug || !specSlug) {
    return NextResponse.json(
      { success: false, error: "classSlug and specSlug are required" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchArchonData(classSlug, specSlug, contentType, encounter || undefined);

    // Just return encounter list
    if (listEncounters) {
      return NextResponse.json({
        success: true,
        encounters: data.encounters || [],
      });
    }

    // Transform archon data into aggregate format expected by comparison engine
    const STAT_NAME_MAP: Record<string, string> = {
      Crit: "critRating",
      "Critical Strike": "critRating",
      Haste: "hasteRating",
      Mastery: "masteryRating",
      Vers: "versatilityRating",
      Versatility: "versatilityRating",
    };

    const avgStats: Record<string, { avg: number; p25: number; p50: number; p75: number; p100: number }> = {};
    for (const stat of data.stats) {
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

    const statPriority = data.statPriority.map((n) => STAT_NAME_MAP[n] || n).filter(Boolean);

    const gearPopularity: Record<string, { itemId: number; name: string; popularity: number; avgIlvl: number }[]> = {};
    const enchantPopularity: Record<string, { enchantId: number; popularity: number }[]> = {};
    const gemMap = new Map<number, number>();

    const allItems = [...data.gear, ...data.weapons, ...data.trinkets];
    for (const item of allItems) {
      const slot = item.slot;
      if (!gearPopularity[slot]) gearPopularity[slot] = [];
      gearPopularity[slot].push({ itemId: item.itemId, name: item.name, popularity: item.popularity / 100, avgIlvl: 0 });

      if (item.enchants.length > 0) {
        if (!enchantPopularity[slot]) enchantPopularity[slot] = [];
        for (const e of item.enchants) {
          enchantPopularity[slot].push({ enchantId: e.id, popularity: item.popularity / 100 });
        }
      }
      for (const g of item.gems) {
        const existing = gemMap.get(g.id) || 0;
        gemMap.set(g.id, Math.max(existing, item.popularity / 100));
      }
    }
    for (const slot of Object.keys(gearPopularity)) {
      gearPopularity[slot].sort((a, b) => b.popularity - a.popularity);
    }
    for (const slot of Object.keys(enchantPopularity)) {
      const seen = new Map<number, number>();
      enchantPopularity[slot] = enchantPopularity[slot].filter((e) => {
        if ((seen.get(e.enchantId) || 0) >= e.popularity) return false;
        seen.set(e.enchantId, e.popularity);
        return true;
      }).sort((a, b) => b.popularity - a.popularity).slice(0, 5);
    }
    const gemPopularity = Array.from(gemMap.entries())
      .map(([gemId, popularity]) => ({ gemId, popularity }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 10);

    // Background: update DB cache so fallback data stays fresh
    if (!encounter || encounter === "all-bosses") {
      syncForSpec(classSlug, specSlug, contentType as "mythic_plus" | "raid").catch(() => {});
    }

    return NextResponse.json({
      success: true,
      aggregate: {
        avgStats,
        statPriority,
        gearPopularity,
        enchantPopularity,
        gemPopularity,
        playerCount: data.totalParses,
      },
      talentBuilds: data.talentBuilds || [],
      encounters: data.encounters || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
