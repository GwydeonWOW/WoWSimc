import type { GearSlot, WowClass, WoWRegion } from "@/types/wow";
import { GEAR_SLOTS, WOW_CLASSES, WoW_REGIONS } from "@/types/wow";
import type { ParseResult, ParseWarning, SimCCharacterOutput } from "./parser.types";

// Set of valid gear slot names
const GEAR_SLOT_SET = new Set<string>(GEAR_SLOTS);

/**
 * Parse a gear item line from SimC format
 * Modern format: slot=,id=XXX[,enchant_id=XX][,gem_id=XX:YY][,bonus_id=XX/YY][,crafted_stats=XX/YY]
 * Note: ilevel is no longer included in modern SimC addon output
 */
function parseGearItem(
  slotName: string,
  rawValue: string,
  itemHint?: { name: string; ilvl: number }
): { item: { itemId: number; ilvl: number; name?: string; [key: string]: unknown } | null; warning?: ParseWarning } {
  const parts = rawValue.split(",");

  const item: Record<string, unknown> = {};

  // Apply hint from comment line if available
  if (itemHint) {
    item.name = itemHint.name;
    item.ilvl = itemHint.ilvl;
  }

  for (const part of parts) {
    if (part.length === 0) continue;

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
      case "crafting_quality":
        item.craftingQuality = parseInt(value, 10);
        break;
      case "set_bonus":
        item.setBonus = value;
        break;
    }
  }

  if (!item.itemId) {
    return {
      item: null,
      warning: {
        line: `${slotName}=${rawValue}`,
        lineNumber: 0,
        message: `Invalid gear item: missing id for slot ${slotName}`,
      },
    };
  }

  // Default ilvl to 0 if not found anywhere
  if (!item.ilvl) {
    item.ilvl = 0;
  }

  return { item: item as { itemId: number; ilvl: number; [key: string]: unknown } };
}

/**
 * Parse a comment line to extract item name and ilvl
 * Format: "# Item Name (285)" or "# Item Name (276)"
 */
function parseItemComment(line: string): { name: string; ilvl: number } | null {
  const match = line.match(/^#\s+(.+?)\s+\((\d+)\)\s*$/);
  if (!match) return null;
  return { name: match[1], ilvl: parseInt(match[2], 10) };
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

  const lines = input.split("\n").map((l) => l.trimEnd());

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
  let lastCommentHint: { name: string; ilvl: number } | null = null;

  for (const rawLine of lines) {
    lineNumber++;

    // Skip empty lines
    if (rawLine.length === 0) continue;

    // Check for comment lines - might contain item hints
    if (rawLine.startsWith("#")) {
      const hint = parseItemComment(rawLine);
      if (hint) {
        lastCommentHint = hint;
      }
      continue;
    }

    // Skip --- separator lines
    if (rawLine.startsWith("---")) continue;

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
      lastCommentHint = null;
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
      const result = parseGearItem(key, value, lastCommentHint || undefined);
      if (result.item) {
        gear[key] = result.item;
      }
      if (result.warning) {
        warnings.push({ ...result.warning, lineNumber });
      }
      lastCommentHint = null;
      continue;
    }

    // Reset comment hint if this isn't a gear line
    lastCommentHint = null;

    // Check if it's a stat with various possible key formats
    const statKey = normalizeStatKey(key);
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
      case "checksum":
        // Known but unused for now
        break;
      default:
        // Try to parse as unknown stat with _rating suffix
        if (key.endsWith("_rating")) {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            stats[key] = num;
          }
        } else {
          // Silently ignore unknown keys (modern SimC has many extra fields)
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
      strength: stats.strength || 0,
      agility: stats.agility || 0,
      intellect: stats.intellect || 0,
      stamina: stats.stamina || 0,
      critRating: stats.critRating || 0,
      hasteRating: stats.hasteRating || 0,
      masteryRating: stats.masteryRating || 0,
      versatilityRating: stats.versatilityRating || 0,
      avoidanceRating: stats.avoidanceRating || 0,
      speedRating: stats.speedRating || 0,
      leechRating: stats.leechRating || 0,
    },
  };

  return { success: true, character, warnings, errors };
}

/**
 * Normalize various stat key formats to our internal format
 */
function normalizeStatKey(key: string): string | null {
  const map: Record<string, string> = {
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
    spell_power: "spellPower",
    attack_power: "attackPower",
    // Alternative shorter names
    crit: "critRating",
    haste: "hasteRating",
    mastery: "masteryRating",
    versatility: "versatilityRating",
  };

  return map[key] || null;
}
