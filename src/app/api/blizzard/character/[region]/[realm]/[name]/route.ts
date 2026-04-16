import { NextResponse } from "next/server";
import { getBlizzardClient } from "@/lib/api/blizzard";
import type { WoWRegion } from "@/types/wow";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ region: string; realm: string; name: string }> }
) {
  const { region, realm, name } = await params;

  try {
    const client = getBlizzardClient(region as WoWRegion);

    const [profile, equipment, specializations, stats] = await Promise.all([
      client.getCharacterProfile(realm, name).catch(() => null),
      client.getCharacterEquipment(realm, name).catch(() => null),
      client.getCharacterSpecializations(realm, name).catch(() => null),
      client.getCharacterStats(realm, name).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      profile,
      equipment,
      specializations,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
