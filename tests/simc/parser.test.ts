import { describe, it, expect } from "vitest";
import { parseSimCString } from "@/lib/simc/parser";
import {
  SAMPLE_FROST_MAGE,
  SAMPLE_ARMS_WARRIOR,
  SAMPLE_RESTORATION_SHAMAN,
  SAMPLE_MINIMAL,
  SAMPLE_INVALID,
  SAMPLE_EMPTY,
  SAMPLE_NO_CLASS,
} from "../fixtures/sample-simc-strings";

describe("parseSimCString", () => {
  describe("Frost Mage", () => {
    it("parses class and name correctly", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      expect(result.success).toBe(true);
      expect(result.character!.name).toBe("Frostmage");
      expect(result.character!.class).toBe("mage");
    });

    it("parses metadata correctly", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      expect(result.character!.level).toBe(80);
      expect(result.character!.race).toBe("undead");
      expect(result.character!.region).toBe("eu");
      expect(result.character!.server).toBe("tarren-mill");
      expect(result.character!.spec).toBe("frost");
      expect(result.character!.role).toBe("spell");
    });

    it("parses talents correctly", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      expect(result.character!.talents.raw).toBe(
        "BQABAAAAAAAAAAAAAAAAAAAAAAAg0AAAAAABSSSk0SCaDSkEJJRJSEJt0CA"
      );
    });

    it("parses all gear slots", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      const gear = result.character!.gear;
      expect(gear.head).toBeDefined();
      expect(gear.head!.itemId).toBe(220920);
      expect(gear.head!.ilvl).toBe(639);
      expect(gear.main_hand).toBeDefined();
      expect(gear.main_hand!.itemId).toBe(220929);
    });

    it("parses gear enchant and gem ids", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      const head = result.character!.gear.head!;
      expect(head.enchantId).toBe(8780);
      expect(head.gemIds).toEqual([213904, 213778]);
    });

    it("parses stats correctly", () => {
      const result = parseSimCString(SAMPLE_FROST_MAGE);
      expect(result.character!.stats.intellect).toBe(24567);
      expect(result.character!.stats.critRating).toBe(8234);
      expect(result.character!.stats.hasteRating).toBe(6789);
      expect(result.character!.stats.masteryRating).toBe(4567);
      expect(result.character!.stats.versatilityRating).toBe(3456);
    });
  });

  describe("Arms Warrior", () => {
    it("parses warrior class correctly", () => {
      const result = parseSimCString(SAMPLE_ARMS_WARRIOR);
      expect(result.success).toBe(true);
      expect(result.character!.class).toBe("warrior");
      expect(result.character!.name).toBe("Bruteforce");
      expect(result.character!.spec).toBe("arms");
      expect(result.character!.role).toBe("attack");
      expect(result.character!.region).toBe("us");
    });

    it("parses warrior stats", () => {
      const result = parseSimCString(SAMPLE_ARMS_WARRIOR);
      expect(result.character!.stats.strength).toBe(34567);
    });
  });

  describe("Restoration Shaman", () => {
    it("parses healer correctly", () => {
      const result = parseSimCString(SAMPLE_RESTORATION_SHAMAN);
      expect(result.success).toBe(true);
      expect(result.character!.class).toBe("shaman");
      expect(result.character!.spec).toBe("restoration");
      expect(result.character!.role).toBe("heal");
    });

    it("parses gear with optional fields missing", () => {
      const result = parseSimCString(SAMPLE_RESTORATION_SHAMAN);
      const neck = result.character!.gear.neck!;
      expect(neck.enchantId).toBe(8760);
      expect(neck.gemIds).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("handles minimal SimC string", () => {
      const result = parseSimCString(SAMPLE_MINIMAL);
      expect(result.success).toBe(true);
      expect(result.character!.name).toBe("Test");
      expect(result.character!.class).toBe("mage");
      expect(result.character!.level).toBe(80);
      expect(result.character!.stats.intellect).toBe(10000);
    });

    it("fails on invalid input", () => {
      const result = parseSimCString(SAMPLE_INVALID);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("handles empty input", () => {
      const result = parseSimCString(SAMPLE_EMPTY);
      expect(result.success).toBe(false);
    });

    it("fails gracefully when no class declaration", () => {
      const result = parseSimCString(SAMPLE_NO_CLASS);
      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'No class declaration found. The SimC string must start with className="CharacterName"'
      );
    });

    it("defaults region to eu when invalid", () => {
      const input = `mage="Test"\nlevel=80\nregion=mars\nspec=frost\nintellect=1000`;
      const result = parseSimCString(input);
      expect(result.success).toBe(true);
      expect(result.character!.region).toBe("eu");
      expect(result.warnings.some((w) => w.message.includes("Unknown region"))).toBe(true);
    });
  });
});
