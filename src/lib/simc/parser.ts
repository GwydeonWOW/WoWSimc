import type { GearSlot, WowClass, WoWRegion } from "@/types/wow";
import { GEAR_SLOTS, WOW_CLASSES, WoW_REGIONS } from "@/types/wow";
import type { ParseResult, ParseWarning, SimCCharacterOutput } from "./parser.types";

// Map of stat keys from SimC format to our internal format
const STAT_KEY_MAP: Record<string, string> = {
  strength: "strength",
  agility: "agility",
  intellect: "intellect",
  stamina: "stamina",
  crit_rating: "critRating",
  haste_rating: "hasteRating",
  mastery_rating: "masteryRating",
  versatility_rating: "versatilityRating",
  avoidance_rating: "avoidanceRating",
  speed_rating: "speedRating",
  leech_rating: "leechRating",
  // Alternative formats
  spell_power: "spellPower",
  attack_power: "attackPower",
};

// Set of valid gear slot names
const GEAR_SLOT_SET = new Set<string>(GEAR_SLOTS);

// Set of known metadata keys
const METADATA_KEYS = new Set([
  "level",
  "race",
  "region",
  "server",
  "spec",
  "role",
  "professions",
  "talents",
  "class_talents",
  "spec_talents",
  "hero_talents",
  "pvp_talents",
  "covenant",
  "soulbind",
  "conduit",
  "heartbeat",
]);

/**
 * Parse a gear item line from SimC format
 * Format: slot=,id=XXX,ilevel=XXX[,enchant_id=XX][,gem_id=XX:YY][,bonus_id=XX/YY][,drop_level=XX][,crafted_stats=XX/YY][,set_bonus=XX]
 */
function parseGearItem(
  slotName: string,
  rawValue: string
): { item: { itemId: number; ilvl: number; [key: string]: unknown } | null; warning?: ParseWarning } {
  // Split by comma, first element is empty (before the first comma)
  const parts = rawValue.split(",");

  const item: Record<string, unknown> = {};

  for (const part of parts) {
    if (part.length === 0) continue; // Skip empty parts

    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;

    const key = part.substring(0, eqIndex);
    const value = part.substring(eqIndex + 1);

    switch (key) {
      case "id":
        item.itemId = parseInt(value, 10);
        break;
      case "ilevel":
        item.ilvl = parseInt(value, 10);
        break;
      case "enchant_id":
        item.enchantId = parseInt(value, 10);
        break;
      case "gem_id":
        item.gemIds = value.split(":").map((g) => parseInt(g, 10)).filter((n) => !isNaN(n));
        break;
      case "bonus_id":
        item.bonusIds = value.split("/").map((b) => parseInt(b, 10)).filter((n) => !isNaN(n));
        break;
      case "drop_level":
        item.dropLevel = parseInt(value, 10);
        break;
      case "crafted_stats":
        item.craftedStats = value.split("/").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
        break;
      case "set_bonus":
        item.setBonus = value;
        break;
    }
  }

  if (!item.itemId || !item.ilvl) {
    return {
      item: null,
      warning: {
        line: `${slotName}=${rawValue}`,
        lineNumber: 0,
        message: `Invalid gear item: missing id or ilevel for slot ${slotName}`,
      },
    };
  }

  return { item: item as { itemId: number; ilvl: number; [key: string]: unknown } };
}

/**
 * Parse the class and name from a SimC class declaration line
 * Format: className="CharacterName"
 */
function parseClassDeclaration(
  line: string
): { className: string; characterName: string } | null {
  const match = line.match(/^(\w+)="([^"]+)"/);
  if (!match) return null;

  const className = match[1].toLowerCase();
  const characterName = match[2];

  return { className, characterName };
}

/**
 * Split talent string into class/spec/hero tree components
 * Format: classHash-/-specHash[-/-heroHash]
 */
function parseTalentString(raw: string): {
  raw: string;
  classTree?: string;
  specTree?: string;
  heroTree?: string;
} {
  const parts = raw.split("-/-");
  return {
    raw,
    classTree: parts[0] || undefined,
    specTree: parts[1] || undefined,
    heroTree: parts[2] || undefined,
  };
}

/**
 * Parse a SimC addon string into a structured character object
 */
export function parseSimCString(input: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const errors: string[] = [];

  const lines = input.split("\n").map((l) => l.trim());

  // Temporary storage
  let className: string | null = null;
  let characterName: string | null = null;
  let level = 80;
  let race = "";
  let region: WoWRegion = "eu";
  let server = "";
  let spec = "";
  let role = "spell";
  let talentRaw = "";
  const gear: Record<string, ReturnType<typeof parseGearItem>["item"]> = {};
  const stats: Record<string, number> = {};

  let classLineFound = false;
  let lineNumber = 0;

  for (const rawLine of lines) {
    lineNumber++;

    // Skip empty lines and comments
    if (rawLine.length === 0 || rawLine.startsWith("#") || rawLine.startsWith("---")) {
      continue;
    }

    // Check for class declaration: className="CharacterName"
    const classDecl = parseClassDeclaration(rawLine);
    if (classDecl) {
      if (!WOW_CLASSES.includes(classDecl.className as WowClass)) {
        warnings.push({
          line: rawLine,
          lineNumber,
          message: `Unknown class: ${classDecl.className}`,
        });
        continue;
      }
      className = classDecl.className;
      characterName = classDecl.characterName;
      classLineFound = true;
      continue;
    }

    // Parse key=value lines
    const eqIndex = rawLine.indexOf("=");
    if (eqIndex === -1) {
      warnings.push({
        line: rawLine,
        lineNumber,
        message: "Unrecognized line format (not key=value)",
      });
      continue;
    }

    const key = rawLine.substring(0, eqIndex);
    const value = rawLine.substring(eqIndex + 1);

    // Check if it's a gear slot
    if (GEAR_SLOT_SET.has(key)) {
      const result = parseGearItem(key, value);
      if (result.item) {
        gear[key] = result.item;
      }
      if (result.warning) {
        warnings.push({ ...result.warning, lineNumber });
      }
      continue;
    }

    // Check if it's a stat
    const statKey = STAT_KEY_MAP[key];
    if (statKey) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        stats[statKey] = num;
      }
      continue;
    }

    // Check if it's a metadata key
    switch (key) {
      case "level":
        level = parseInt(value, 10) || 80;
        break;
      case "race":
        race = value;
        break;
      case "region":
        if (WoW_REGIONS.includes(value as WoWRegion)) {
          region = value as WoWRegion;
        } else {
          warnings.push({
            line: rawLine,
            lineNumber,
            message: `Unknown region: ${value}, defaulting to eu`,
          });
        }
        break;
      case "server":
        server = value;
        break;
      case "spec":
        spec = value;
        break;
      case "role":
        role = value;
        break;
      case "talents":
        talentRaw = value;
        break;
      case "professions":
      case "pvp_talents":
      case "covenant":
      case "soulbind":
      case "conduit":
      case "heartbeat":
        // Known but unused for now
        break;
      default:
        // Try to parse as stat with _rating suffix
        if (key.endsWith("_rating")) {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            stats[key] = num;
          }
        } else {
          warnings.push({
            line: rawLine,
            lineNumber,
            message: `Unknown key: ${key}`,
          });
        }
        break;
    }
  }

  // Validate required fields
  if (!classLineFound) {
    errors.push("No class declaration found. The SimC string must start with className=\"CharacterName\"");
  }
  if (!characterName) {
    errors.push("Character name not found");
  }
  if (!spec) {
    warnings.push({
      line: "",
      lineNumber: 0,
      message: "Spec not specified in SimC string",
    });
  }

  if (errors.length > 0) {
    return { success: false, warnings, errors };
  }

  const character: SimCCharacterOutput = {
    name: characterName!,
    class: className as WowClass,
    level,
    race,
    region,
    server,
    spec,
    role,
    talents: parseTalentString(talentRaw),
    gear: gear as Record<string, { itemId: number; ilvl: number; [key: string]: unknown }>,
    stats: {
      strength: (stats.strength as number) || 0,
      agility: (stats.agility as number) || 0,
      intellect: (stats.intellect as number) || 0,
      stamina: (stats.stamina as number) || 0,
      critRating: (stats.critRating as number) || 0,
      hasteRating: (stats.hasteRating as number) || 0,
      masteryRating: (stats.masteryRating as number) || 0,
      versatilityRating: (stats.versatilityRating as number) || 0,
      avoidanceRating: (stats.avoidanceRating as number) || 0,
      speedRating: (stats.speedRating as number) || 0,
      leechRating: (stats.leechRating as number) || 0,
    },
  };

  return { success: true, character, warnings, errors };
}
