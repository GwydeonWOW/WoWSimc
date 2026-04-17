/**
 * Archon.gg scraper client
 *
 * Fetches aggregated top-player data from archon.gg (Warcraft Logs) pages.
 * Uses __NEXT_DATA__ JSON embedded in the server-rendered HTML.
 *
 * URL patterns:
 *   M+:    https://www.archon.gg/wow/builds/{spec}/{class}/mythic-plus/overview/10/all-dungeons/this-week
 *   Raid:  https://www.archon.gg/wow/builds/{spec}/{class}/raid/overview/mythic/all-bosses
 *
 * Archon provides data based on ALL parses (tens of thousands), not just top 50.
 */

const ARCHON_BASE = "https://www.archon.gg/wow/builds";

/** Maps our internal class slugs to archon.gg URL slugs */
const CLASS_SLUG_MAP: Record<string, string> = {
  deathknight: "death-knight",
  demonhunter: "demon-hunter",
  druid: "druid",
  evoker: "evoker",
  hunter: "hunter",
  mage: "mage",
  monk: "monk",
  paladin: "paladin",
  priest: "priest",
  rogue: "rogue",
  shaman: "shaman",
  warlock: "warlock",
  warrior: "warrior",
};

/** Maps our internal spec slugs to archon.gg URL slugs */
const SPEC_SLUG_MAP: Record<string, string> = {
  beastmastery: "beast-mastery",
  marksmanship: "marksmanship",
};

/** Archon gear slot index to our internal slot names */
const ARCHON_GEAR_SLOTS = [
  "head",    // 0
  "neck",    // 1
  "shoulder", // 2
  "back",    // 3
  "chest",   // 4
  "wrist",   // 5
  "hands",   // 6
  "waist",   // 7
  "legs",    // 8
  "feet",    // 9
  "finger1", // 10
  "finger2", // 11
] as const;

export interface ArchonStatEntry {
  name: string; // "Crit", "Haste", "Mastery", "Vers"
  order: number;
  rating: number; // lower bound of avg at 95th percentile
}

export interface ArchonGearItem {
  itemId: number;
  name: string;
  popularity: number; // percentage like 86.4
  parses: string;     // "32.8k parses"
  enchants: { id: number; name: string }[];
  gems: { id: number; name: string }[];
  slot: string;
}

export interface ArchonPageData {
  stats: ArchonStatEntry[];
  statPriority: string[];
  gear: ArchonGearItem[];
  weapons: ArchonGearItem[];
  trinkets: ArchonGearItem[];
  totalParses: number;
  lastUpdated: string;
}

function getArchonClassSlug(ourClassSlug: string): string {
  return CLASS_SLUG_MAP[ourClassSlug] || ourClassSlug;
}

function getArchonSpecSlug(ourSpecSlug: string): string {
  return SPEC_SLUG_MAP[ourSpecSlug] || ourSpecSlug;
}

/**
 * Build the archon.gg URL for a class/spec/content combo
 */
function buildArchonUrl(classSlug: string, specSlug: string, contentType: string): string {
  const archonClass = getArchonClassSlug(classSlug);
  const archonSpec = getArchonSpecSlug(specSlug);

  if (contentType === "raid") {
    return `${ARCHON_BASE}/${archonSpec}/${archonClass}/raid/overview/mythic/all-bosses`;
  }
  // Default: M+
  return `${ARCHON_BASE}/${archonSpec}/${archonClass}/mythic-plus/overview/10/all-dungeons/this-week`;
}

/**
 * Fetch and parse an archon.gg build page
 */
export async function fetchArchonData(
  classSlug: string,
  specSlug: string,
  contentType: string = "mythic_plus"
): Promise<ArchonPageData> {
  const url = buildArchonUrl(classSlug, specSlug, contentType);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Archon.gg fetch failed: ${response.status} for ${url}`);
  }

  const html = await response.text();
  return parseArchonHTML(html);
}

/**
 * Parse archon.gg HTML to extract structured data from __NEXT_DATA__
 */
export function parseArchonHTML(html: string): ArchonPageData {
  // Extract __NEXT_DATA__ JSON
  const startTag = '<script id="__NEXT_DATA__"';
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) {
    throw new Error("Could not find __NEXT_DATA__ in archon.gg page");
  }
  const jsonStart = html.indexOf(">", startIdx) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  const jsonStr = html.substring(jsonStart, jsonEnd);
  let nextData: Record<string, unknown>;
  try {
    nextData = JSON.parse(jsonStr);
  } catch {
    throw new Error("Could not parse __NEXT_DATA__ JSON from archon.gg page");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (nextData as any)?.props?.pageProps?.page as Record<string, any> | null;
  if (!page) {
    throw new Error("Could not extract page data from archon.gg __NEXT_DATA__");
  }

  const sections = page.sections || [];

  // Parse stats
  const stats: ArchonStatEntry[] = [];
  const statPriority: string[] = [];

  for (const section of sections) {
    if (section.component === "BuildsStatPrioritySection") {
      const rawStats = section.props?.stats || [];
      for (const stat of rawStats) {
        if (stat.name && stat.name !== "Intellect") {
          stats.push({
            name: stat.name,
            order: stat.order,
            rating: stat.value || 0,
          });
        }
      }
      // Build priority from order
      stats.sort((a, b) => a.order - b.order);
      for (const stat of stats) {
        statPriority.push(stat.name);
      }
      break;
    }
  }

  // Parse gear
  const gear: ArchonGearItem[] = [];
  const weapons: ArchonGearItem[] = [];
  const trinkets: ArchonGearItem[] = [];

  for (const section of sections) {
    if (section.component === "BuildsBestInSlotGearSection") {
      const rawGear = section.props?.gear || [];
      const rawWeapons = section.props?.weapons || [];
      const rawTrinkets = section.props?.trinkets || [];

      for (let i = 0; i < rawGear.length; i++) {
        const item = parseGearIcon(rawGear[i], ARCHON_GEAR_SLOTS[i] || `slot${i}`);
        if (item) gear.push(item);
      }

      for (const w of rawWeapons) {
        const item = parseGearIcon(w, "main_hand");
        if (item) weapons.push(item);
      }

      // Trinkets: first goes to trinket1, second to trinket2
      for (let i = 0; i < rawTrinkets.length; i++) {
        const slot = i === 0 ? "trinket1" : "trinket2";
        const item = parseGearIcon(rawTrinkets[i], slot);
        if (item) trinkets.push(item);
      }
      break;
    }
  }

  return {
    stats,
    statPriority,
    gear,
    weapons,
    trinkets,
    totalParses: page.totalParses || 0,
    lastUpdated: page.lastUpdated || "",
  };
}

/**
 * Parse a gear item from archon's pseudo-JSX icon string
 */
function parseGearIcon(rawItem: { icon: string; topLabel: string; bottomLabel: string }, slot: string): ArchonGearItem | null {
  const icon = rawItem?.icon || "";
  if (!icon) return null;

  // Extract item ID: id={250060}
  const idMatch = icon.match(/id=\{(\d+)\}/);
  if (!idMatch) return null;
  const itemId = parseInt(idMatch[1], 10);

  // Extract item name: &nbsp;Item Name</span>
  const nameMatch = icon.match(/&nbsp;(.+?)<\/span>/);
  const name = nameMatch ? nameMatch[1] : `Item ${itemId}`;

  // Popularity percentage: "86.4%"
  const popularity = parseFloat(rawItem.topLabel) || 0;

  // Parse count: "32.8k parses"
  const parses = rawItem.bottomLabel || "";

  // Extract enchants: enchants={[{"id":244007,"name":"...",...}]}
  const enchants: { id: number; name: string }[] = [];
  const enchantsMatch = icon.match(/enchants=\{(\[[^\]]*\])\}/);
  if (enchantsMatch) {
    try {
      const enchantsArr = JSON.parse(enchantsMatch[1]);
      for (const e of enchantsArr) {
        if (e.id && e.name) enchants.push({ id: e.id, name: e.name });
      }
    } catch {}
  }

  // Extract gems: gems={[{"id":240908,"name":"...",...}]}
  const gems: { id: number; name: string }[] = [];
  const gemsMatch = icon.match(/gems=\{(\[[^\]]*\])\}/);
  if (gemsMatch) {
    try {
      const gemsArr = JSON.parse(gemsMatch[1]);
      for (const g of gemsArr) {
        if (g.id && g.name) gems.push({ id: g.id, name: g.name });
      }
    } catch {}
  }

  return { itemId, name, popularity, parses, enchants, gems, slot };
}
