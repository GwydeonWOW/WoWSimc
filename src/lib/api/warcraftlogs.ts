/**
 * Warcraft Logs GraphQL API client
 *
 * Used for fetching M+ group composition data.
 * OAuth token management + composition queries.
 */

const WCL_API_URL = "https://www.warcraftlogs.com/api/v2/client";
const WCL_OAUTH_URL = "https://www.warcraftlogs.com/oauth/token";

// --- Token management ---

interface WCLToken {
  access_token: string;
  expires_in: number;
  fetchedAt: number;
}

let tokenCache: WCLToken | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() - tokenCache.fetchedAt < tokenCache.expires_in * 1000 - 60000) {
    return tokenCache.access_token;
  }

  const clientId = process.env.WCL_CLIENT_ID || "a1990f5f-c622-4157-a786-a217eee75aa7";
  const clientSecret = process.env.WCL_CLIENT_SECRET || "AdYeGIS4uAjt7XQw4VBemlM4IFshvoyWcQP0v7B5";

  const response = await fetch(WCL_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`WCL OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    access_token: data.access_token,
    expires_in: data.expires_in,
    fetchedAt: Date.now(),
  };

  return tokenCache.access_token;
}

async function wclQuery(query: string): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const response = await fetch(WCL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`WCL API error: ${response.status}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`WCL GraphQL error: ${json.errors[0]?.message}`);
  }
  return json.data;
}

// --- Types ---

export interface CompositionPlayer {
  className: string;  // e.g. "Mage"
  specName: string;   // e.g. "Frost"
  role: "tank" | "healer" | "dps";
}

export interface CompositionEntry {
  tank: CompositionPlayer;
  healer: CompositionPlayer;
  dps: CompositionPlayer[];
  count: number;
  percentage: number;
  avgKeystoneLevel: number;
}

export interface CompositionResult {
  compositions: CompositionEntry[];
  totalRuns: number;
  season: string;
}

// --- Role detection ---

const TANK_SPECS = new Set(["Guardian", "Brewmaster", "Protection", "Vengeance", "Blood"]);
const HEALER_SPECS = new Set(["Restoration", "Holy", "Discipline", "Mistweaver", "Preservation"]);

function getRole(specName: string): "tank" | "healer" | "dps" {
  if (TANK_SPECS.has(specName)) return "tank";
  if (HEALER_SPECS.has(specName)) return "healer";
  return "dps";
}

// Parse WCL icon field: "Mage-Frost" → { className: "Mage", specName: "Frost" }
function parseActorIcon(icon: string): { className: string; specName: string } | null {
  if (!icon || icon === "Unknown") return null;
  const parts = icon.split("-");
  if (parts.length < 2) {
    // Some actors only have class name, no spec
    return { className: parts[0], specName: parts[0] };
  }
  return { className: parts[0], specName: parts[1] };
}

// --- Slug mapping ---

// Our slugs → WCL class/spec names
function toWCLClassName(slug: string): string {
  const map: Record<string, string> = {
    deathknight: "DeathKnight",
    demonhunter: "DemonHunter",
  };
  return map[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

function toWCLSpecName(slug: string): string {
  const map: Record<string, string> = {
    beastmastery: "Beast Mastery",
    marksmanship: "Marksmanship",
  };
  return map[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

// --- Zone/Encounter cache ---

interface EncounterInfo {
  id: number;
  name: string;
}

let encounterCache: { zoneId: number; encounters: EncounterInfo[]; fetchedAt: number } | null = null;

/**
 * Get the current M+ season zone ID by finding the highest "Mythic+ Season N" zone
 */
async function getCurrentMPlusZoneId(): Promise<number> {
  const data = await wclQuery(`{ worldData { zones { id name } } }`);
  const zones = (data?.worldData as { zones: { id: number; name: string }[] })?.zones || [];

  // Find Mythic+ Season zones, pick highest ID (most recent)
  const mplusZones = zones
    .filter((z) => z.name.startsWith("Mythic+ Season"))
    .sort((a, b) => b.id - a.id);

  if (mplusZones.length === 0) {
    throw new Error("No M+ season zone found in WCL");
  }

  return mplusZones[0].id;
}

/**
 * Get encounters (dungeons) for the current M+ season
 */
async function getMPlusEncounters(): Promise<EncounterInfo[]> {
  if (encounterCache && Date.now() - encounterCache.fetchedAt < 3600000) {
    return encounterCache.encounters;
  }

  const zoneId = await getCurrentMPlusZoneId();
  const data = await wclQuery(`{ worldData { zone(id: ${zoneId}) { id name encounters { id name } } } }`);
  const zone = (data?.worldData as { zone: { id: number; name: string; encounters: EncounterInfo[] } })?.zone;

  if (!zone?.encounters?.length) {
    throw new Error("No encounters found for M+ zone");
  }

  encounterCache = {
    zoneId,
    encounters: zone.encounters,
    fetchedAt: Date.now(),
  };

  return zone.encounters;
}

// --- Main composition query ---

interface RankingEntry {
  report: { code: string; fightID: number | null };
  hardModeLevel: number;
}

interface ActorInfo {
  id: number;
  icon: string;
}

interface FightInfo {
  id: number;
  keystoneLevel: number;
  friendlyPlayers: number[];
}

/**
 * Get character rankings for an M+ encounter, returning report codes
 */
async function getCharacterRankings(
  encounterId: number,
  className: string,
  specName: string,
  page: number = 1
): Promise<RankingEntry[]> {
  const data = await wclQuery(
    `{worldData{encounter(id:${encounterId}){characterRankings(className:"${className}",specName:"${specName}",metric:default,page:${page})}}}`
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encounter = (data?.worldData as any)?.encounter;
  const rankings = encounter?.characterRankings?.rankings || [];
  return rankings;
}

/**
 * Get party composition from a specific report fight
 */
async function getReportFightComposition(
  code: string,
  fightId: number
): Promise<{ players: CompositionPlayer[]; keystoneLevel: number } | null> {
  const data = await wclQuery(
    `{reportData{report(code:"${code}"){fights(fightIDs:[${fightId}]){id keystoneLevel friendlyPlayers}masterData{actors(type:"player"){id icon}}}}}`
  );

  const report = (data?.reportData as { report: { fights: FightInfo[]; masterData: { actors: ActorInfo[] } } })?.report;
  if (!report) return null;

  const fight = report.fights?.[0];
  if (!fight || !fight.keystoneLevel) return null;

  // Build actor map
  const actorMap = new Map<number, string>();
  for (const actor of report.masterData?.actors || []) {
    actorMap.set(actor.id, actor.icon);
  }

  // Get party members from friendlyPlayers
  const players: CompositionPlayer[] = [];
  for (const playerId of fight.friendlyPlayers || []) {
    const icon = actorMap.get(playerId);
    if (!icon) continue;
    const parsed = parseActorIcon(icon);
    if (!parsed) continue;

    const role = getRole(parsed.specName);
    players.push({ className: parsed.className, specName: parsed.specName, role });
  }

  return { players, keystoneLevel: fight.keystoneLevel };
}

// --- Aggregation ---

function compositionKey(players: CompositionPlayer[]): string {
  const tank = players.find((p) => p.role === "tank");
  const healer = players.find((p) => p.role === "healer");
  const dps = players.filter((p) => p.role === "dps").sort((a, b) => a.specName.localeCompare(b.specName));

  const parts: string[] = [];
  if (tank) parts.push(`T:${tank.specName}${tank.className}`);
  if (healer) parts.push(`H:${healer.specName}${healer.className}`);
  for (const d of dps) parts.push(`D:${d.specName}${d.className}`);
  return parts.join("|");
}

// --- Cache for composition results ---

const compositionCache = new Map<string, { result: CompositionResult; fetchedAt: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Get top M+ group compositions for a spec
 */
export async function getTopCompositions(classSlug: string, specSlug: string): Promise<CompositionResult> {
  const cacheKey = `${classSlug}:${specSlug}`;
  const cached = compositionCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.result;
  }

  const className = toWCLClassName(classSlug);
  const specName = toWCLSpecName(specSlug);

  // Step 1: Get encounters (dungeons) for current M+ season
  const encounters = await getMPlusEncounters();

  // Step 2: Get character rankings for each encounter, extract report codes
  const reportFights: { code: string; fightId: number; keystoneLevel: number }[] = [];
  const seenReports = new Set<string>();

  // Query first 2 pages per encounter for more data
  for (const encounter of encounters) {
    for (let page = 1; page <= 2; page++) {
      try {
        const rankings = await getCharacterRankings(encounter.id, className, specName, page);
        for (const r of rankings) {
          if (
            r.report?.code &&
            r.report.fightID &&
            r.hardModeLevel >= 10 &&
            !seenReports.has(`${r.report.code}:${r.report.fightID}`)
          ) {
            seenReports.add(`${r.report.code}:${r.report.fightID}`);
            reportFights.push({
              code: r.report.code,
              fightId: r.report.fightID,
              keystoneLevel: r.hardModeLevel,
            });
          }
        }
      } catch {
        // Skip failed encounter queries
      }
    }
  }

  if (reportFights.length === 0) {
    const empty: CompositionResult = { compositions: [], totalRuns: 0, season: "" };
    compositionCache.set(cacheKey, { result: empty, fetchedAt: Date.now() });
    return empty;
  }

  // Step 3: Limit to top 30 unique reports to control API usage
  const uniqueReports = reportFights.slice(0, 30);

  // Step 4: Get composition for each report (with concurrency limit)
  const compositionMap = new Map<string, {
    tank: CompositionPlayer;
    healer: CompositionPlayer;
    dps: CompositionPlayer[];
    count: number;
    totalKeyLevel: number;
  }>();

  const batchSize = 5;
  for (let i = 0; i < uniqueReports.length; i += batchSize) {
    const batch = uniqueReports.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((rf) => getReportFightComposition(rf.code, rf.fightId))
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      if (!result.value) continue;
      const { players, keystoneLevel } = result.value;

      if (players.length !== 5) continue;

      const key = compositionKey(players);
      const tank = players.find((p) => p.role === "tank");
      const healer = players.find((p) => p.role === "healer");
      const dps = players.filter((p) => p.role === "dps");

      if (!tank || !healer || dps.length !== 3) continue;

      const existing = compositionMap.get(key);
      if (existing) {
        existing.count++;
        existing.totalKeyLevel += keystoneLevel;
      } else {
        compositionMap.set(key, {
          tank,
          healer,
          dps,
          count: 1,
          totalKeyLevel: keystoneLevel,
        });
      }
    }
  }

  // Step 5: Aggregate and sort
  const totalRuns = Array.from(compositionMap.values()).reduce((sum, c) => sum + c.count, 0);
  const compositions: CompositionEntry[] = Array.from(compositionMap.values())
    .map((c) => ({
      tank: c.tank,
      healer: c.healer,
      dps: c.dps,
      count: c.count,
      percentage: totalRuns > 0 ? Math.round((c.count / totalRuns) * 1000) / 10 : 0,
      avgKeystoneLevel: Math.round((c.totalKeyLevel / c.count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const result: CompositionResult = {
    compositions,
    totalRuns,
    season: encounterCache?.zoneId ? `Zone ${encounterCache.zoneId}` : "",
  };

  compositionCache.set(cacheKey, { result, fetchedAt: Date.now() });
  return result;
}
