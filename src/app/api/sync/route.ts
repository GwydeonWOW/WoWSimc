import { NextResponse } from "next/server";
import { syncForSpec } from "@/lib/aggregation/top-players";
import { CURRENT_SEASON, CLASS_SPECS } from "@/types/wow";
import type { WoWRegion } from "@/types/wow";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const classSlug = body.classSlug as string | undefined;
    const specSlug = body.specSlug as string | undefined;
    const contentType = (body.contentType as string) || "mythic_plus";
    const region = (body.region as WoWRegion) || "eu";
    const season = body.season || CURRENT_SEASON;

    // Single spec sync
    if (classSlug && specSlug) {
      const syncJob = await prisma.syncJob.create({
        data: {
          type: "top_players",
          status: "running",
          classSlug,
          specSlug,
          contentType,
        },
      });

      const result = await syncForSpec(classSlug, specSlug, contentType as "mythic_plus" | "raid", region, season);

      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          status: result.synced > 0 ? "completed" : "failed",
          playerCount: result.synced,
          error: result.errors.length > 0 ? result.errors.join("; ") : null,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: result.synced > 0,
        synced: result.synced,
        errors: result.errors,
        jobId: syncJob.id,
      });
    }

    // Full sync: all specs
    const results: { classSlug: string; specSlug: string; synced: number; errors: string[] }[] = [];
    const allSpecs: { cls: string; spec: string }[] = [];

    for (const [cls, specs] of Object.entries(CLASS_SPECS)) {
      for (const spec of specs) {
        allSpecs.push({ cls, spec });
      }
    }

    for (let i = 0; i < allSpecs.length; i++) {
      const { cls, spec } = allSpecs[i];
      try {
        const result = await syncForSpec(cls, spec, contentType as "mythic_plus" | "raid", region, season);
        results.push({ classSlug: cls, specSlug: spec, synced: result.synced, errors: result.errors });
        // Rate limit: wait 500ms between murlok requests
        if (i < allSpecs.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (e) {
        results.push({
          classSlug: cls,
          specSlug: spec,
          synced: 0,
          errors: [e instanceof Error ? e.message : String(e)],
        });
      }
    }

    const totalSynced = results.reduce((s, r) => s + r.synced, 0);
    const allErrors = results.filter((r) => r.errors.length > 0);

    return NextResponse.json({
      success: totalSynced > 0,
      totalSpecs: allSpecs.length,
      totalSynced,
      errors: allErrors.length > 0 ? `${allErrors.length} specs had errors` : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
