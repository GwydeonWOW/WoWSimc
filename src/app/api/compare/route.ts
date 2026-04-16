import { NextResponse } from "next/server";
import { compareCharacter } from "@/lib/comparison/engine";
import type { SimCCharacterOutput } from "@/lib/simc/parser.types";
import type { ContentType } from "@/types/wow";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { character, aggregate, contentType } = body as {
      character: SimCCharacterOutput;
      aggregate: Record<string, unknown>;
      contentType: ContentType;
    };

    if (!character || !aggregate || !contentType) {
      return NextResponse.json(
        { success: false, error: "character, aggregate, and contentType are required" },
        { status: 400 }
      );
    }

    const result = compareCharacter(character, aggregate as Parameters<typeof compareCharacter>[1], contentType);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
