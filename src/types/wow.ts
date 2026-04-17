// WoW Class/Spec constants and types

export const CURRENT_SEASON = "season-midnight-1";

export const WOW_CLASSES = [
  "deathknight",
  "demonhunter",
  "druid",
  "evoker",
  "hunter",
  "mage",
  "monk",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
] as const;

export type WowClass = (typeof WOW_CLASSES)[number];

export const CLASS_SPECS: Record<WowClass, string[]> = {
  deathknight: ["blood", "frost", "unholy"],
  demonhunter: ["havoc", "vengeance"],
  druid: ["balance", "feral", "guardian", "restoration"],
  evoker: ["devastation", "preservation", "augmentation"],
  hunter: ["beastmastery", "marksmanship", "survival"],
  mage: ["arcane", "fire", "frost"],
  monk: ["brewmaster", "mistweaver", "windwalker"],
  paladin: ["holy", "protection", "retribution"],
  priest: ["discipline", "holy", "shadow"],
  rogue: ["assassination", "outlaw", "subtlety"],
  shaman: ["elemental", "enhancement", "restoration"],
  warlock: ["affliction", "demonology", "destruction"],
  warrior: ["arms", "fury", "protection"],
};

export const GEAR_SLOTS = [
  "head",
  "neck",
  "shoulder",
  "back",
  "chest",
  "wrist",
  "hands",
  "waist",
  "legs",
  "feet",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "main_hand",
  "off_hand",
] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

export const WoW_REGIONS = ["us", "eu", "cn", "tw", "kr"] as const;
export type WoWRegion = (typeof WoW_REGIONS)[number];

export const CONTENT_TYPES = ["mythic_plus", "raid"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export interface GearItem {
  itemId: number;
  ilvl: number;
  enchantId?: number;
  gemIds?: number[];
  bonusIds?: number[];
  dropLevel?: number;
  craftedStats?: number[];
  setBonus?: string;
}

export interface CharacterStats {
  strength: number;
  agility: number;
  intellect: number;
  stamina: number;
  critRating: number;
  hasteRating: number;
  masteryRating: number;
  versatilityRating: number;
  avoidanceRating?: number;
  speedRating?: number;
  leechRating?: number;
}

export interface CharacterTalents {
  raw: string;
  classTree?: string;
  specTree?: string;
  heroTree?: string;
}

export interface SimCCharacter {
  name: string;
  class: WowClass;
  level: number;
  race: string;
  region: WoWRegion;
  server: string;
  spec: string;
  role: string;
  talents: CharacterTalents;
  gear: Partial<Record<GearSlot, GearItem>>;
  stats: CharacterStats;
}

export interface TopPlayerAggregate {
  classSlug: string;
  specSlug: string;
  contentType: ContentType;
  season: string;
  topTalentBuild: string;
  talentPickRates: Record<string, { pickRate: number; avgRank: number }>;
  avgStats: Record<
    string,
    {
      avg: number;
      p25: number;
      p50: number;
      p75: number;
      p100: number;
    }
  >;
  statPriority: string[];
  gearPopularity: Record<
    string,
    {
      itemId: number;
      name: string;
      popularity: number;
      avgIlvl: number;
    }[]
  >;
  enchantPopularity: Record<string, { enchantId: number; popularity: number }[]>;
  gemPopularity: { gemId: number; popularity: number }[];
  playerCount: number;
}

export interface ClassInfo {
  slug: WowClass;
  name: string;
  specs: { slug: string; name: string; role: "dps" | "healer" | "tank" }[];
  icon: string;
}

export const CLASS_INFO: ClassInfo[] = [
  {
    slug: "deathknight",
    name: "Death Knight",
    specs: [
      { slug: "blood", name: "Blood", role: "tank" },
      { slug: "frost", name: "Frost", role: "dps" },
      { slug: "unholy", name: "Unholy", role: "dps" },
    ],
    icon: "spell_deathknight_classicon",
  },
  {
    slug: "demonhunter",
    name: "Demon Hunter",
    specs: [
      { slug: "havoc", name: "Havoc", role: "dps" },
      { slug: "vengeance", name: "Vengeance", role: "tank" },
    ],
    icon: "classicon_demonhunter",
  },
  {
    slug: "druid",
    name: "Druid",
    specs: [
      { slug: "balance", name: "Balance", role: "dps" },
      { slug: "feral", name: "Feral", role: "dps" },
      { slug: "guardian", name: "Guardian", role: "tank" },
      { slug: "restoration", name: "Restoration", role: "healer" },
    ],
    icon: "classicon_druid",
  },
  {
    slug: "evoker",
    name: "Evoker",
    specs: [
      { slug: "devastation", name: "Devastation", role: "dps" },
      { slug: "preservation", name: "Preservation", role: "healer" },
      { slug: "augmentation", name: "Augmentation", role: "dps" },
    ],
    icon: "classicon_evoker",
  },
  {
    slug: "hunter",
    name: "Hunter",
    specs: [
      { slug: "beastmastery", name: "Beast Mastery", role: "dps" },
      { slug: "marksmanship", name: "Marksmanship", role: "dps" },
      { slug: "survival", name: "Survival", role: "dps" },
    ],
    icon: "classicon_hunter",
  },
  {
    slug: "mage",
    name: "Mage",
    specs: [
      { slug: "arcane", name: "Arcane", role: "dps" },
      { slug: "fire", name: "Fire", role: "dps" },
      { slug: "frost", name: "Frost", role: "dps" },
    ],
    icon: "classicon_mage",
  },
  {
    slug: "monk",
    name: "Monk",
    specs: [
      { slug: "brewmaster", name: "Brewmaster", role: "tank" },
      { slug: "mistweaver", name: "Mistweaver", role: "healer" },
      { slug: "windwalker", name: "Windwalker", role: "dps" },
    ],
    icon: "classicon_monk",
  },
  {
    slug: "paladin",
    name: "Paladin",
    specs: [
      { slug: "holy", name: "Holy", role: "healer" },
      { slug: "protection", name: "Protection", role: "tank" },
      { slug: "retribution", name: "Retribution", role: "dps" },
    ],
    icon: "classicon_paladin",
  },
  {
    slug: "priest",
    name: "Priest",
    specs: [
      { slug: "discipline", name: "Discipline", role: "healer" },
      { slug: "holy", name: "Holy", role: "healer" },
      { slug: "shadow", name: "Shadow", role: "dps" },
    ],
    icon: "classicon_priest",
  },
  {
    slug: "rogue",
    name: "Rogue",
    specs: [
      { slug: "assassination", name: "Assassination", role: "dps" },
      { slug: "outlaw", name: "Outlaw", role: "dps" },
      { slug: "subtlety", name: "Subtlety", role: "dps" },
    ],
    icon: "classicon_rogue",
  },
  {
    slug: "shaman",
    name: "Shaman",
    specs: [
      { slug: "elemental", name: "Elemental", role: "dps" },
      { slug: "enhancement", name: "Enhancement", role: "dps" },
      { slug: "restoration", name: "Restoration", role: "healer" },
    ],
    icon: "classicon_shaman",
  },
  {
    slug: "warlock",
    name: "Warlock",
    specs: [
      { slug: "affliction", name: "Affliction", role: "dps" },
      { slug: "demonology", name: "Demonology", role: "dps" },
      { slug: "destruction", name: "Destruction", role: "dps" },
    ],
    icon: "classicon_warlock",
  },
  {
    slug: "warrior",
    name: "Warrior",
    specs: [
      { slug: "arms", name: "Arms", role: "dps" },
      { slug: "fury", name: "Fury", role: "dps" },
      { slug: "protection", name: "Protection", role: "tank" },
    ],
    icon: "classicon_warrior",
  },
];
