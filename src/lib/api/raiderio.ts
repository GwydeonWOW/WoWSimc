import type { WoWRegion } from "@/types/wow";

const RAIDERIO_BASE = "https://raider.io/api/v1";

interface RaiderIOCharacterProfile {
  name: string;
  race: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  faction: string;
  gear: {
    item_level_equipped: number;
    items: Record<string, {
      id: number;
      name: string;
      itemLevel: number;
      enchantments?: number[];
      gems?: { id: number }[];
      bonusLists?: number[];
    }>;
  };
  mythic_plus_scores: {
    all: number;
    dps: number;
    healer: number;
    tank: number;
  };
  mythic_plus_best_runs?: {
    dungeon: string;
    short_name: string;
    mythic_level: number;
    score: number;
    num_keystone_upgrades: number;
  }[];
  raid_progression?: Record<string, {
    summary: string;
    total_bosses: number;
    normal_bosses_killed: number;
    heroic_bosses_killed: number;
    mythic_bosses_killed: number;
  }>;
}

interface RaiderIORankings {
  rankings: {
    rank: number;
    score: number;
    character: {
      name: string;
      realm: string;
      region: string;
      class: string;
      spec: string;
    };
  }[];
}

export class RaiderIOClient {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.RAIDERIO_API_KEY;
  }

  private async apiRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${RAIDERIO_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      throw new Error(`Raider.IO API error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async getCharacterProfile(
    region: WoWRegion,
    realm: string,
    name: string,
    fields: string[] = ["gear", "mythic_plus_scores", "mythic_plus_best_runs", "raid_progression"]
  ): Promise<RaiderIOCharacterProfile> {
    return this.apiRequest("/characters/profile", {
      region,
      realm,
      name: name.toLowerCase(),
      fields: fields.join(","),
    });
  }

  async getMythicPlusRankings(
    region: WoWRegion,
    classSlug: string,
    specSlug: string,
    season: string = "season-tww-3"
  ): Promise<RaiderIORankings> {
    return this.apiRequest("/mythic-plus/rankings", {
      region,
      class: classSlug,
      spec: specSlug,
      season,
    });
  }
}

let client: RaiderIOClient | null = null;

export function getRaiderIOClient(): RaiderIOClient {
  if (!client) {
    client = new RaiderIOClient();
  }
  return client;
}

export type { RaiderIOCharacterProfile, RaiderIORankings };
