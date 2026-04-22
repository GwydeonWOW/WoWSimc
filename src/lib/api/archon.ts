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
  encounters?: ArchonEncounter[];
  talentBuilds?: ArchonTalentBuild[];
}

export interface ArchonEncounter {
  value: string; // slug like "all-bosses", "imperator"
  label: string; // display name like "All Bosses", "Imperator"
  url: string;   // full path
}

export interface ArchonTalentBuild {
  title: string;
  popularity: number;
  selectedNodes: number[][];
  className: string;
  specName: string;
  changeSetId?: number;
  exportCode?: string;
  heroSpecId?: number;
  isDefaultSelection: boolean;
  reportUrl?: string;
  metricTiles?: { label: string; value: string }[];
}

export interface ArchonConsumableItem {
  itemId: number;
  name: string;
  popularity: number;
}

export interface ArchonConsumablesData {
  flasks: ArchonConsumableItem[];
  food: ArchonConsumableItem[];
  combatPotions: ArchonConsumableItem[];
  weaponBuffs: ArchonConsumableItem[];
  healthPotions: ArchonConsumableItem[];
}

function getArchonClassSlug(ourClassSlug: string): string {
  return CLASS_SLUG_MAP[ourClassSlug] || ourClassSlug;
}

function getArchonSpecSlug(ourSpecSlug: string): string {
  return SPEC_SLUG_MAP[ourSpecSlug] || ourSpecSlug;
}

/**
 * Build the archon.gg URL for a class/spec/content/encounter combo
 */
function buildArchonUrl(classSlug: string, specSlug: string, contentType: string, encounter?: string): string {
  const archonClass = getArchonClassSlug(classSlug);
  const archonSpec = getArchonSpecSlug(specSlug);

  if (contentType === "raid") {
    const boss = encounter || "all-bosses";
    return `${ARCHON_BASE}/${archonSpec}/${archonClass}/raid/overview/mythic/${boss}`;
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
  contentType: string = "mythic_plus",
  encounter?: string
): Promise<ArchonPageData> {
  const url = buildArchonUrl(classSlug, specSlug, contentType, encounter);

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

  // Extract encounter options (for raid boss selection)
  const encounters: ArchonEncounter[] = [];
  const encounterOpts = page.encounterOptions || [];
  for (const opt of encounterOpts) {
    if (opt.value && opt.url) {
      // Label may contain pseudo-JSX like <EncounterIcon id='3176'>Name</EncounterIcon>
      const labelMatch = (opt.label || "").match(/>([^<]+)<\/\w+>$/);
      const label = labelMatch ? labelMatch[1] : (opt.label || opt.value);
      encounters.push({ value: opt.value, label, url: opt.url });
    }
  }

  // Extract talent builds
  const talentBuilds: ArchonTalentBuild[] = [];
  for (const section of sections) {
    if (section.component === "BuildsTalentTreeBuildSection") {
      const buildSets = section.props?.talentTreeBuildSets || [];
      for (const set of buildSets) {
        for (const alt of (set.alternatives || [])) {
          const tree = alt.talentTree?.dehydratedBuild;
          if (tree?.selectedNodes) {
            const exportCode = alt.talentTree?.exportCodeParams?.exportCode || "";
            talentBuilds.push({
              title: alt.title || set.title || "Build",
              popularity: typeof alt.popularity === "string" ? parseFloat(alt.popularity) : (alt.popularity || 0),
              selectedNodes: tree.selectedNodes,
              className: tree.changeSet?.className || "",
              specName: tree.changeSet?.specName || "",
              changeSetId: tree.changeSet?.changeSetId,
              exportCode,
              heroSpecId: tree.heroSpecId,
              isDefaultSelection: alt.isDefaultSelection || false,
              reportUrl: alt.reportUrl || "",
              metricTiles: (set.metricTiles || []).map((t: { label: string; value: string }) => ({ label: t.label, value: t.value })),
            });
          }
        }
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
    encounters,
    talentBuilds,
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

  // Extract item name - multiple formats in archon.gg:
  // 1. BiS items with wowhead badge: <span>&nbsp;Item Name</span>
  // 2. Non-BiS items: '>Item Name</GearIcon>  or  '>Item Name at end of string
  // 3. Generic fallback: any text between > and < in the icon string
  let name = `Item ${itemId}`;
  const spanMatch = icon.match(/&nbsp;(.+?)<\/span>/);
  if (spanMatch) {
    name = spanMatch[1];
  } else {
    // Try format 2: name after last '>' before </GearIcon> or end of string
    const gearIconEnd = icon.indexOf("</GearIcon>");
    const searchEnd = gearIconEnd > -1 ? gearIconEnd : icon.length;
    const lastGt = icon.lastIndexOf(">", searchEnd);
    if (lastGt > -1 && lastGt < searchEnd - 1) {
      const candidate = icon.substring(lastGt + 1, searchEnd).trim();
      if (candidate && !candidate.startsWith("<")) {
        name = candidate;
      }
    }
  }
  // Fallback 3: if still "Item {id}", try any text content between > and < anywhere
  if (name.startsWith("Item ")) {
    const allTextParts: string[] = [];
    const textRegex = />([^<>{&]+)</g;
    let m;
    while ((m = textRegex.exec(icon)) !== null) {
      const txt = m[1].trim();
      if (txt.length > 2 && !/^\d+%?$/.test(txt)) {
        allTextParts.push(txt);
      }
    }
    // Pick the longest meaningful text segment (likely the item name)
    if (allTextParts.length > 0) {
      allTextParts.sort((a, b) => b.length - a.length);
      name = allTextParts[0];
    }
  }

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

/**
 * Parse a consumable item from archon table row HTML
 */
function parseConsumableRow(row: Record<string, string>): ArchonConsumableItem | null {
  const itemHtml = row.item || "";
  const idMatch = itemHtml.match(/id=\{(\d+)\}/);
  if (!idMatch) return null;
  const itemId = parseInt(idMatch[1], 10);

  // Name: last text before </ItemIcon>
  let name = "";
  const nameMatch = itemHtml.match(/>([^<]+)<\/ItemIcon>/);
  const rawName = nameMatch?.[1]?.trim() || "";
  if (rawName && rawName !== "\u00a0" && rawName !== "&nbsp;" && rawName !== "&amp;nbsp;") {
    name = rawName;
  }
  // Fallback: try subLabel attribute
  if (!name) {
    const subMatch = itemHtml.match(/subLabel='([^']+)'/);
    if (subMatch) name = subMatch[1];
  }
  // Fallback: try any meaningful text between > and <
  if (!name || name.startsWith("Item ")) {
    const allText = />([^<>{&]+)</g;
    let m;
    while ((m = allText.exec(itemHtml)) !== null) {
      const txt = m[1].trim();
      if (txt.length > 2 && !/^[\d.]+%?$/.test(txt)) { name = txt; break; }
    }
  }
  if (!name) name = `Item ${itemId}`;

  // Popularity from popularityAndReportLink
  const popHtml = row.popularityAndReportLink || "";
  const popMatch = popHtml.match(/>([\d.]+)%?</);
  const popularity = popMatch ? parseFloat(popMatch[1]) : 0;

  return { itemId, name, popularity };
}

/**
 * Fetch and parse archon.gg consumables page
 */
export async function fetchArchonConsumables(
  classSlug: string,
  specSlug: string,
  contentType: string = "mythic_plus",
  encounter?: string
): Promise<ArchonConsumablesData> {
  const archonClass = getArchonClassSlug(classSlug);
  const archonSpec = getArchonSpecSlug(specSlug);

  let url: string;
  if (contentType === "raid") {
    const boss = encounter || "all-bosses";
    url = `${ARCHON_BASE}/${archonSpec}/${archonClass}/raid/consumables/mythic/${boss}`;
  } else {
    url = `${ARCHON_BASE}/${archonSpec}/${archonClass}/mythic-plus/consumables/10/all-dungeons/this-week`;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Archon.gg consumables fetch failed: ${response.status} for ${url}`);
  }

  const html = await response.text();

  // Extract __NEXT_DATA__
  const startTag = '<script id="__NEXT_DATA__"';
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) {
    throw new Error("Could not find __NEXT_DATA__ in archon.gg consumables page");
  }
  const jsonStart = html.indexOf(">", startIdx) + 1;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  const jsonStr = html.substring(jsonStart, jsonEnd);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextData: any = JSON.parse(jsonStr);
  const page = nextData?.props?.pageProps?.page;
  const sections = page?.sections || [];

  // Find the tables section (BuildsConsumableTablesSection)
  const result: ArchonConsumablesData = {
    flasks: [],
    food: [],
    combatPotions: [],
    weaponBuffs: [],
    healthPotions: [],
  };

  for (const section of sections) {
    if (section.component === "BuildsConsumableTablesSection") {
      const tables = section.props?.tables || [];
      // Table order: Flask, Food, Health Potion, Weapon Buff, Combat Potion
      // Identify by header
      for (const table of tables) {
        const headerHtml = table.columns?.item?.header || "";
        const items: ArchonConsumableItem[] = [];

        for (const row of table.data || []) {
          const item = parseConsumableRow(row);
          if (!item || item.popularity < 1) continue;
          // Skip items with unresolved names
          if (item.name.startsWith("Item ")) continue;
          items.push(item);
        }

        if (headerHtml.includes("Flask")) {
          result.flasks = items;
        } else if (headerHtml.includes("Food")) {
          result.food = items;
        } else if (headerHtml.includes("Health Potion")) {
          result.healthPotions = items;
        } else if (headerHtml.includes("Weapon Buff")) {
          result.weaponBuffs = items;
        } else if (headerHtml.includes("Combat Potion") || headerHtml.includes("Potion")) {
          result.combatPotions = items;
        }
      }
      break;
    }
  }

  return result;
}
