import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CURRENT_SEASON } from "@/types/wow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const classSlug = searchParams.get("classSlug");
  const specSlug = searchParams.get("specSlug");
  const contentType = searchParams.get("contentType") || "mythic_plus";
  const season = searchParams.get("season") || CURRENT_SEASON;

  if (!classSlug || !specSlug) {
    return NextResponse.json(
      { success: false, error: "classSlug and specSlug are required" },
      { status: 400 }
    );
  }

  try {
    const aggregate = await prisma.topPlayerAggregate.findUnique({
      where: {
        classSlug_specSlug_contentType_season: {
          classSlug,
          specSlug,
          contentType,
          season,
        },
      },
    });

    if (!aggregate) {
      return NextResponse.json(
        { success: false, error: "No aggregate data found for this class/spec/content type" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      aggregate: {
        avgStats: aggregate.avgStats,
        statPriority: aggregate.statPriority,
        gearPopularity: aggregate.gearPopularity,
        enchantPopularity: aggregate.enchantPopularity,
        gemPopularity: aggregate.gemPopularity,
        topTalentBuild: aggregate.topTalentBuild,
        playerCount: aggregate.playerCount,
      },
      updatedAt: aggregate.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
