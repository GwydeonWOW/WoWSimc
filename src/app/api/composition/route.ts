import { NextResponse } from "next/server";
import { getTopCompositions } from "@/lib/api/warcraftlogs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const classSlug = searchParams.get("classSlug");
  const specSlug = searchParams.get("specSlug");

  if (!classSlug || !specSlug) {
    return NextResponse.json(
      { success: false, error: "classSlug and specSlug are required" },
      { status: 400 }
    );
  }

  try {
    const result = await getTopCompositions(classSlug, specSlug);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
