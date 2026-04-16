import { z } from "zod";
import type { GearSlot, WowClass, WoWRegion } from "@/types/wow";
import { GEAR_SLOTS, WOW_CLASSES, WoW_REGIONS } from "@/types/wow";

const GearItemSchema = z.object({
  itemId: z.number(),
  ilvl: z.number(),
  name: z.string().optional(),
  enchantId: z.number().optional(),
  gemIds: z.array(z.number()).optional(),
  bonusIds: z.array(z.number()).optional(),
  dropLevel: z.number().optional(),
  craftedStats: z.array(z.number()).optional(),
  craftingQuality: z.number().optional(),
  setBonus: z.string().optional(),
});

const CharacterStatsSchema = z.object({
  strength: z.number().default(0),
  agility: z.number().default(0),
  intellect: z.number().default(0),
  stamina: z.number().default(0),
  critRating: z.number().default(0),
  hasteRating: z.number().default(0),
  masteryRating: z.number().default(0),
  versatilityRating: z.number().default(0),
  avoidanceRating: z.number().default(0),
  speedRating: z.number().default(0),
  leechRating: z.number().default(0),
});

export const SimCCharacterSchema = z.object({
  name: z.string().min(1),
  class: z.enum(WOW_CLASSES),
  level: z.number().default(80),
  race: z.string(),
  region: z.enum(WoW_REGIONS),
  server: z.string(),
  spec: z.string(),
  role: z.string(),
  talents: z.object({
    raw: z.string(),
    classTree: z.string().optional(),
    specTree: z.string().optional(),
    heroTree: z.string().optional(),
  }),
  gear: z.record(z.string(), GearItemSchema),
  stats: CharacterStatsSchema,
});

export type SimCCharacterOutput = z.infer<typeof SimCCharacterSchema>;

export interface ParseWarning {
  line: string;
  lineNumber: number;
  message: string;
}

export interface ParseResult {
  success: boolean;
  character?: SimCCharacterOutput;
  warnings: ParseWarning[];
  errors: string[];
}
