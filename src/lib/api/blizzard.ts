import type { WoWRegion } from "@/types/wow";

const BLIZZARD_API_BASE = "https://{region}.api.blizzard.com";
const BLIZZARD_OAUTH_BASE = "https://{region}.battle.net/oauth/token";

interface BlizzardToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  fetchedAt: number;
}

interface BlizzardCharacterProfile {
  id: number;
  name: string;
  gender: { type: string };
  faction: { type: string };
  race: { id: number; name: string };
  character_class: { id: number; name: string };
  active_spec: { id: number; name: string };
  level: number;
  average_item_level: number;
  equipped_item_level: number;
}

interface BlizzardEquipmentItem {
  item: { id: number; name: string };
  slot: { type: string };
  level: { value: number };
  enchantments?: { enchantment_id: number; source_item?: { id: number } }[];
  gems?: { item: { id: number } }[];
  set?: { id: number; name: string; items: { id: number }[] };
}

interface BlizzardSpecialization {
  specialization: { id: number; name: string };
  talent_loadout: {
    talent_ids: number[];
    is_active: boolean;
  }[];
}

interface BlizzardStat {
  effective: number;
  rating?: number;
  rating_bonus?: number;
  value?: number;
}

interface BlizzardCharacterStats {
  health: number;
  power: number;
  strength: BlizzardStat;
  agility: BlizzardStat;
  intellect: BlizzardStat;
  stamina: BlizzardStat;
  crit: BlizzardStat;
  haste: BlizzardStat;
  mastery: BlizzardStat;
  versatility_damage_done: BlizzardStat;
  versatility_healing_done: BlizzardStat;
  versatility_damage_taken: BlizzardStat;
}

interface BlizzardMythicKeystoneProfile {
  current_period: {
    period: number;
    best_runs: {
      dungeon: { id: number; name: string };
      keystone_level: number;
      completed: boolean;
      score: number;
    }[];
  };
  mythic_plus_scores: {
    score: number;
  };
}

export class BlizzardAPIClient {
  private clientId: string;
  private clientSecret: string;
  private region: WoWRegion;
  private tokenCache: BlizzardToken | null = null;
  private redisUrl: string | null;

  constructor(
    region: WoWRegion = "eu",
    clientId?: string,
    clientSecret?: string,
    redisUrl?: string
  ) {
    this.clientId = clientId || process.env.BLIZZARD_CLIENT_ID || "";
    this.clientSecret = clientSecret || process.env.BLIZZARD_CLIENT_SECRET || "";
    this.region = region;
    this.redisUrl = redisUrl || process.env.REDIS_URL || null;
  }

  private getApiBase(): string {
    return BLIZZARD_API_BASE.replace("{region}", this.region);
  }

  private getOAuthBase(): string {
    return BLIZZARD_OAUTH_BASE.replace("{region}", this.region);
  }

  async getAccessToken(): Promise<string> {
    // Check in-memory cache
    if (this.tokenCache && Date.now() - this.tokenCache.fetchedAt < this.tokenCache.expires_in * 1000 - 60000) {
      return this.tokenCache.access_token;
    }

    // Check Redis cache if available
    if (this.redisUrl) {
      try {
        const { Redis } = await import("ioredis");
        const redis = new Redis(this.redisUrl);
        const cached = await redis.get(`blizzard:token:${this.region}`);
        if (cached) {
          this.tokenCache = JSON.parse(cached);
          return this.tokenCache!.access_token;
        }
      } catch {
        // Redis not available, continue with direct fetch
      }
    }

    // Fetch new token
    const response = await fetch(this.getOAuthBase(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Blizzard OAuth failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    this.tokenCache = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      fetchedAt: Date.now(),
    };

    // Cache in Redis
    if (this.redisUrl) {
      try {
        const { Redis } = await import("ioredis");
        const redis = new Redis(this.redisUrl);
        await redis.set(
          `blizzard:token:${this.region}`,
          JSON.stringify(this.tokenCache),
          "EX",
          data.expires_in - 60
        );
      } catch {
        // Redis not available
      }
    }

    return this.tokenCache.access_token;
  }

  private async apiRequest<T>(endpoint: string, namespace: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.getApiBase()}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Battlenet-Namespace": `${namespace}-${this.region}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Blizzard API error ${response.status}: ${body}`);
    }

    return response.json();
  }

  async getCharacterProfile(realmSlug: string, characterName: string): Promise<BlizzardCharacterProfile> {
    return this.apiRequest<BlizzardCharacterProfile>(
      `/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}`,
      "profile"
    );
  }

  async getCharacterEquipment(realmSlug: string, characterName: string): Promise<{ equipped_items: BlizzardEquipmentItem[] }> {
    return this.apiRequest(
      `/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/equipment`,
      "profile"
    );
  }

  async getCharacterSpecializations(realmSlug: string, characterName: string): Promise<{ specializations: BlizzardSpecialization[] }> {
    return this.apiRequest(
      `/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/specializations`,
      "profile"
    );
  }

  async getCharacterStats(realmSlug: string, characterName: string): Promise<BlizzardCharacterStats> {
    return this.apiRequest<BlizzardCharacterStats>(
      `/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/statistics`,
      "profile"
    );
  }

  async getMythicKeystoneProfile(realmSlug: string, characterName: string): Promise<BlizzardMythicKeystoneProfile> {
    return this.apiRequest<BlizzardMythicKeystoneProfile>(
      `/profile/wow/character/${realmSlug}/${characterName.toLowerCase()}/mythic-keystone-profile`,
      "profile"
    );
  }

  async getItemMedia(itemId: number): Promise<{ assets: { key: string; value: string }[] }> {
    return this.apiRequest(
      `/data/wow/media/item/${itemId}`,
      "static"
    );
  }
}

// Singleton per region
const clients: Partial<Record<WoWRegion, BlizzardAPIClient>> = {};

export function getBlizzardClient(region: WoWRegion = "eu"): BlizzardAPIClient {
  if (!clients[region]) {
    clients[region] = new BlizzardAPIClient(region);
  }
  return clients[region]!;
}

export type {
  BlizzardCharacterProfile,
  BlizzardEquipmentItem,
  BlizzardSpecialization,
  BlizzardCharacterStats,
  BlizzardMythicKeystoneProfile,
};
