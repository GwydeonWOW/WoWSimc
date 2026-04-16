import { NextResponse } from "next/server";
import { parseSimCString } from "@/lib/simc/parser";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { simcString } = body as { simcString: string };

    if (!simcString || typeof simcString !== "string") {
      return NextResponse.json(
        { success: false, errors: ["No SimC string provided"] },
        { status: 400 }
      );
    }

    const result = parseSimCString(simcString);

    if (!result.success) {
      return NextResponse.json(
        { success: false, errors: result.errors, warnings: result.warnings },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      character: result.character,
      warnings: result.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, errors: ["Invalid request body"] },
      { status: 400 }
    );
  }
}
