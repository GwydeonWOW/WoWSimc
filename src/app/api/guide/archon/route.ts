import { NextResponse } from "next/server";
import { fetchArchonData } from "@/lib/api/archon";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const classSlug = searchParams.get("classSlug");
  const specSlug = searchParams.get("specSlug");
  const contentType = searchParams.get("contentType") || "mythic_plus";
  const encounter = searchParams.get("encounter") || undefined;

  if (!classSlug || !specSlug) {
    return NextResponse.json(
      { success: false, error: "classSlug and specSlug are required" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchArchonData(classSlug, specSlug, contentType, encounter);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
