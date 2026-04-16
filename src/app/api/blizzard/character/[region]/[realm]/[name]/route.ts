import { NextResponse } from "next/server";
import { getBlizzardClient } from "@/lib/api/blizzard";
import type { WoWRegion } from "@/types/wow";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ region: string; realm: string; name: string }> }
) {
  const { region, realm, name } = await params;

  const errors: string[] = [];

  try {
    const client = getBlizzardClient(region as WoWRegion);

    // First test: get OAuth token
    try {
      await client.getAccessToken();
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: `OAuth failed: ${e instanceof Error ? e.message : String(e)}. Check BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET env vars.`,
      }, { status: 500 });
    }

    // Fetch all character data
    const [profile, equipment, specializations, stats] = await Promise.all([
      client.getCharacterProfile(realm, name).catch((e) => { errors.push(`Profile: ${e instanceof Error ? e.message : String(e)}`); return null; }),
      client.getCharacterEquipment(realm, name).catch((e) => { errors.push(`Equipment: ${e instanceof Error ? e.message : String(e)}`); return null; }),
      client.getCharacterSpecializations(realm, name).catch((e) => { errors.push(`Specs: ${e instanceof Error ? e.message : String(e)}`); return null; }),
      client.getCharacterStats(realm, name).catch((e) => { errors.push(`Stats: ${e instanceof Error ? e.message : String(e)}`); return null; }),
    ]);

    return NextResponse.json({
      success: true,
      profile,
      equipment,
      specializations,
      stats,
      errors: errors.length > 0 ? errors : undefined,
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
