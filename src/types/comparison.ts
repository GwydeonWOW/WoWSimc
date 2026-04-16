import type { GearSlot, ContentType, GearItem, CharacterStats } from "./wow";

export interface StatComparisonResult {
  stat: string;
  userValue: number;
  topAvg: number;
  topP25: number;
  topP50: number;
  topP75: number;
  topP100: number;
  percentile: number;
  diff: number;
  diffPercent: number;
}

export interface GearComparisonSlot {
  slot: GearSlot;
  userItem: GearItem | null;
  topItems: {
    itemId: number;
    name: string;
    popularity: number;
    avgIlvl: number;
  }[];
  score: number;
  isMatch: boolean;
  isUpgrade: boolean;
}

export interface TalentComparisonNode {
  talentId: string;
  name: string;
  icon: string;
  row: number;
  col: number;
  userHas: boolean;
  topPickRate: number;
  diff: "match" | "user_extra" | "user_missing";
}

export interface ComparisonScore {
  stats: number;
  gear: number;
  talents: number;
  enchants: number;
  overall: number;
}

export interface Recommendation {
  type: "gear" | "talent" | "stat" | "enchant" | "gem";
  severity: "high" | "medium" | "low";
  slot?: GearSlot;
  message: string;
  currentValue?: string;
  recommendedValue?: string;
}

export interface ComparisonResult {
  contentType: ContentType;
  scores: ComparisonScore;
  stats: StatComparisonResult[];
  gear: GearComparisonSlot[];
  talents: TalentComparisonNode[];
  recommendations: Recommendation[];
}
