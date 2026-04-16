import { NextResponse } from "next/server";
import { getBlizzardClient } from "@/lib/api/blizzard";
import type { WoWRegion } from "@/types/wow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = (searchParams.get("region") || "eu") as WoWRegion;

  try {
    const client = getBlizzardClient(region);
    const token = await client.getAccessToken();

    return NextResponse.json({
      success: true,
      region,
      token_preview: token.substring(0, 10) + "...",
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
