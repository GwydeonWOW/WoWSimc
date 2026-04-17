/**
 * Murlok.io scraper client
 *
 * Fetches aggregated top-player data from murlok.io HTML pages.
 * URL pattern: https://murlok.io/{class}/{spec}/m+
 *
 * Murlok refreshes every ~8 hours based on top 50 players per spec.
 */

import * as cheerio from "cheerio";

const MURLOK_BASE = "https://murlok.io";

/** Maps our internal class slugs to murlok.io URL slugs */
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

/** Maps our internal spec slugs to murlok.io URL slugs */
const SPEC_SLUG_MAP: Record<string, string> = {
  beastmastery: "beast-mastery",
  marksmanship: "marksmanship",
  // Most specs match 1:1, only these differ
};

/** Maps murlok.io gear slot names to our internal slot names */
const MURLOK_SLOT_MAP: Record<string, string> = {
  Head: "head",
  Neck: "neck",
  Shoulders: "shoulder",
  Back: "back",
  Chest: "chest",
  Wrist: "wrist",
  Hands: "hands",
  Waist: "waist",
  Legs: "legs",
  Feet: "feet",
  Rings: "finger1", // Murlok merges both rings into one section
  Trinkets: "trinket1", // Murlok merges both trinkets into one section
  "Main Hand": "main_hand",
  "Off Hand": "off_hand",
};

export interface MurlokStatEntry {
  name: string; // "Critical Strike", "Haste", "Mastery", "Versatility"
  percent: number;
  rating: number;
}

export interface MurlokGearItem {
  itemId: number;
  name: string;
  playerCount: number; // how many of top 50 use this item
}

export interface MurlokEnchantEntry {
  name: string;
  playerCount: number;
}

export interface MurlokGemEntry {
  itemId: number;
  name: string;
  playerCount: number;
}

export interface MurlokPageData {
  stats: MurlokStatEntry[];
  statPriority: string[];
  gear: Record<string, MurlokGearItem[]>;
  enchants: Record<string, MurlokEnchantEntry[]>;
  gems: MurlokGemEntry[];
  playerCount: number;
}

function getMurlokClassSlug(ourClassSlug: string): string {
  return CLASS_SLUG_MAP[ourClassSlug] || ourClassSlug;
}

function getMurlokSpecSlug(ourSpecSlug: string): string {
  return SPEC_SLUG_MAP[ourSpecSlug] || ourSpecSlug;
}

function getMurlokContentType(contentType: string): string {
  if (contentType === "mythic_plus") return "m+";
  if (contentType === "raid") return "m+"; // Fallback: murlok may not have raid separately
  return "m+";
}

/**
 * Fetch and parse a murlok.io page for a class/spec/content combo
 */
export async function fetchMurlokData(
  classSlug: string,
  specSlug: string,
  contentType: string = "mythic_plus"
): Promise<MurlokPageData> {
  const murlokClass = getMurlokClassSlug(classSlug);
  const murlokSpec = getMurlokSpecSlug(specSlug);
  const murlokContent = getMurlokContentType(contentType);

  const url = `${MURLOK_BASE}/${murlokClass}/${murlokSpec}/${murlokContent}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Murlok.io fetch failed: ${response.status} for ${url}`);
  }

  const html = await response.text();
  return parseMurlokHTML(html);
}

/**
 * Parse murlok.io HTML to extract structured data
 */
export function parseMurlokHTML(html: string): MurlokPageData {
  const $ = cheerio.load(html);

  // Parse stats from "Optimal Secondary Stats" section
  const stats: MurlokStatEntry[] = [];
  const statPriority: string[] = [];

  $(".guide-stats")
    .first()
    .find(".guide-stats-chart-item")
    .each((_i, el) => {
      const text = $(el).find("span").first().text().trim();
      // e.g. "27% Critical Strike"
      const match = text.match(/^(\d+)%\s+(.+)$/);
      if (match) {
        const percent = parseInt(match[1], 10);
        const name = match[2].trim();
        // Rating is in the h3 span: "+919"
        const ratingText = $(el).find("span.h3").text().trim();
        const rating = parseInt(ratingText.replace("+", ""), 10) || 0;
        stats.push({ name, percent, rating });
      }
    });

  // Stat priority order from the <ol> after "Stat priority"
  $(".guide-stats")
    .first()
    .find("ol li")
    .each((_i, el) => {
      const name = $(el).text().trim();
      if (name) statPriority.push(name);
    });

  // Parse gear section
  const gear: Record<string, MurlokGearItem[]> = {};

  // Find the gear section and iterate over slot blocks
  const gearSection = $("#gear, section:has(h2:contains('Best-in-Slot'))").first();
  gearSection.find(".vi-box-with-header").each((_i, slotBlock) => {
    const slotHeader = $(slotBlock).find("h3").first().text().trim();
    const ourSlot = MURLOK_SLOT_MAP[slotHeader];
    if (!ourSlot) return;

    const items: MurlokGearItem[] = [];
    $(slotBlock)
      .find("li.vi-poppable")
      .each((_j, itemEl) => {
        const name = $(itemEl).find("h4.h3").first().text().trim();
        const href = $(itemEl).find("a").attr("href") || "";
        const itemIdMatch = href.match(/item=(\d+)/);
        const itemId = itemIdMatch ? parseInt(itemIdMatch[1], 10) : 0;

        // Player count is in the SVG-based number (the <li> with person SVG icon)
        const countText = $(itemEl).find(".vi-media-object").last().text().trim();
        const playerCount = parseInt(countText, 10) || 0;

        if (itemId > 0 && name) {
          items.push({ itemId, name, playerCount });
        }
      });

    if (items.length > 0) {
      // For "Rings" and "Trinkets", store under both slots
      if (slotHeader === "Rings") {
        gear["finger1"] = items;
        gear["finger2"] = items;
      } else if (slotHeader === "Trinkets") {
        gear["trinket1"] = items;
        gear["trinket2"] = items;
      } else {
        gear[ourSlot] = items;
      }
    }
  });

  // Parse enchants section
  const enchants: Record<string, MurlokEnchantEntry[]> = {};
  const enchantSection = $("#enchantments, section:has(h2:contains('Enchantments'))").first();
  enchantSection.find(".vi-box-with-header").each((_i, slotBlock) => {
    const slotHeader = $(slotBlock).find("h3").first().text().trim();
    const ourSlot = MURLOK_SLOT_MAP[slotHeader];
    if (!ourSlot) return;

    const entries: MurlokEnchantEntry[] = [];
    $(slotBlock)
      .find("li.vi-poppable")
      .each((_j, itemEl) => {
        const name = $(itemEl).find("h4.h3").first().text().trim();
        const countText = $(itemEl).find(".vi-media-object").last().text().trim();
        const playerCount = parseInt(countText, 10) || 0;
        if (name && playerCount > 0) {
          entries.push({ name, playerCount });
        }
      });

    if (entries.length > 0) {
      if (slotHeader === "Rings") {
        enchants["finger1"] = entries;
        enchants["finger2"] = entries;
      } else {
        enchants[ourSlot] = entries;
      }
    }
  });

  // Parse gems section
  const gems: MurlokGemEntry[] = [];
  const gemSection = $("#gems, section:has(h2:contains('Gems'))").first();
  gemSection.find("li.vi-poppable").each((_i, itemEl) => {
    const name = $(itemEl).find("h4.h3").first().text().trim();
    const href = $(itemEl).find("a").attr("href") || "";
    const itemIdMatch = href.match(/item=(\d+)/);
    const itemId = itemIdMatch ? parseInt(itemIdMatch[1], 10) : 0;
    const countText = $(itemEl).find(".vi-media-object").last().text().trim();
    const playerCount = parseInt(countText, 10) || 0;
    if (itemId > 0 && name) {
      gems.push({ itemId, name, playerCount });
    }
  });

  // Player count (always 50 per murlok's methodology)
  const playerCount = 50;

  return { stats, statPriority, gear, enchants, gems, playerCount };
}
