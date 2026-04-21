"use client";

import { useState } from "react";
import { parseSimCString } from "@/lib/simc/parser";
import type { SimCCharacterOutput } from "@/lib/simc/parser.types";
import type { ParseWarning } from "@/lib/simc/parser.types";
import type { ComparisonResult } from "@/types/comparison";
import type { ContentType } from "@/types/wow";
import type { CompositionResult as CompResult, CompositionEntry } from "@/lib/api/warcraftlogs";
import type { ArchonConsumablesData } from "@/lib/api/archon";
import { CURRENT_SEASON, GEAR_SLOTS } from "@/types/wow";

interface EncounterOption {
  value: string;
  label: string;
}

interface TalentBuild {
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

interface BlizzardStatsResponse {
  spell_crit?: { rating_normalized: number };
  melee_crit?: { rating_normalized: number };
  spell_haste?: { rating_normalized: number };
  melee_haste?: { rating_normalized: number };
  mastery?: { rating_normalized: number };
  versatility?: number;
  strength?: { effective: number };
  agility?: { effective: number };
  intellect?: { effective: number };
  stamina?: { effective: number };
}

export default function ComparePage() {
  const [simcInput, setSimcInput] = useState("");
  const [character, setCharacter] = useState<SimCCharacterOutput | null>(null);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [contentType, setContentType] = useState<ContentType>("mythic_plus");
  const [encounters, setEncounters] = useState<EncounterOption[]>([]);
  const [selectedBoss, setSelectedBoss] = useState<string>("all-bosses");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "gear" | "talents" | "tips">("stats");
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<string>("");
  const [talentBuilds, setTalentBuilds] = useState<TalentBuild[]>([]);
  const [composition, setComposition] = useState<CompResult | null>(null);
  const [consumables, setConsumables] = useState<ArchonConsumablesData | null>(null);

  const hasStats = (char: SimCCharacterOutput) =>
    char.stats.critRating > 0 || char.stats.hasteRating > 0 || char.stats.masteryRating > 0 || char.stats.versatilityRating > 0;

  const gearCount = (char: SimCCharacterOutput) =>
    GEAR_SLOTS.filter((s) => char.gear[s]).length;

  async function handleParse() {
    setLoading(true);
    setErrors([]);
    setWarnings([]);
    setApiStatus("");

    try {
      const result = parseSimCString(simcInput);

      if (!result.success) {
        setErrors(result.errors);
        setLoading(false);
        return;
      }

      const char = result.character!;
      setCharacter(char);
      setWarnings(result.warnings);

      // Step 1: Fetch real stats from Blizzard API
      if (char.region && char.server && char.name) {
        setApiStatus("Obteniendo stats de Blizzard API...");
        try {
          const res = await fetch(`/api/blizzard/character/${char.region}/${char.server}/${char.name}`);
          const data = await res.json();
          if (data.success && data.stats) {
            const s = data.stats;
            const critData = s.spell_crit || s.melee_crit;
            const hasteData = s.spell_haste || s.melee_haste;
            char.stats.critRating = critData?.rating_normalized || 0;
            char.stats.hasteRating = hasteData?.rating_normalized || 0;
            char.stats.masteryRating = s.mastery?.rating_normalized || 0;
            char.stats.versatilityRating = typeof s.versatility === "number" ? s.versatility : 0;
            char.stats.strength = s.strength?.effective || 0;
            char.stats.agility = s.agility?.effective || 0;
            char.stats.intellect = s.intellect?.effective || 0;
            char.stats.stamina = s.stamina?.effective || 0;
          } else if (!data.success) {
            setApiStatus("Blizzard API: " + (data.error || "Error desconocido"));
          }
        } catch (e) {
          setApiStatus("Blizzard API no disponible: " + (e instanceof Error ? e.message : String(e)));
        }
      }

      setCharacter({ ...char });

      // Step 2: Fetch aggregate data and run comparison
      if (contentType === "raid") {
        fetchEncountersForSpec(char.class, char.spec);
      }
      await fetchAndCompare(char, contentType);
    } catch {
      setErrors(["Error parsing SimC string"]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAndCompare(char: SimCCharacterOutput, ct: ContentType, boss?: string) {
    setApiStatus((prev) => prev || "Cargando datos de top players...");
    setComparison(null);
    setTalentBuilds([]);
    setComposition(null);
    setConsumables(null);

    const effectiveBoss = boss ?? selectedBoss;

    try {
      // Primary: always fetch from archon.gg on-demand for fresh data with correct item names
      const ctParam = ct === "raid" ? "raid" : "mythic_plus";
      const encounterParam = ct === "raid" && effectiveBoss && effectiveBoss !== "all-bosses" ? `&encounter=${effectiveBoss}` : "";
      setApiStatus(`Cargando datos desde archon.gg...`);

      const archonRes = await fetch(
        `/api/compare/archon?classSlug=${char.class}&specSlug=${char.spec}&contentType=${ctParam}${encounterParam}`
      );
      const archonJson = await archonRes.json();

      if (archonJson.success && archonJson.aggregate) {
        setTalentBuilds(archonJson.talentBuilds || []);

        // Fetch M+ composition data in background (only for M+)
        if (ct === "mythic_plus") {
          fetch(`/api/composition?classSlug=${char.class}&specSlug=${char.spec}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.success) setComposition(d as CompResult);
            })
            .catch(() => {});
        }

        // Fetch consumables data in background
        const ctParam = ct === "raid" ? "raid" : "mythic_plus";
        const encParam = ct === "raid" && effectiveBoss && effectiveBoss !== "all-bosses" ? `&encounter=${effectiveBoss}` : "";
        fetch(`/api/guide/consumables?classSlug=${char.class}&specSlug=${char.spec}&contentType=${ctParam}${encParam}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.success) setConsumables(d.data);
          })
          .catch(() => {});

        const compRes = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: char, aggregate: archonJson.aggregate, contentType: ct }),
        });
        const compData = await compRes.json();

        if (compData.success) {
          setComparison(compData.result);
          setApiStatus("");
          return;
        }
      }

      // Fallback: try DB aggregate
      setApiStatus("Cargando datos cacheados...");
      const dbRes = await fetch(
        `/api/compare/aggregate?classSlug=${char.class}&specSlug=${char.spec}&contentType=${ct}&season=${CURRENT_SEASON}`
      );
      const dbData = await dbRes.json();

      if (dbData.success && dbData.aggregate) {
        const compRes = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: char, aggregate: dbData.aggregate, contentType: ct }),
        });
        const compData = await compRes.json();

        if (compData.success) {
          setComparison(compData.result);
          setApiStatus("Datos cacheados (pueden estar desactualizados)");
          return;
        }
      }

      setApiStatus(`No se pudieron obtener datos de top players para ${char.class} ${char.spec}.`);
      setComparison(null);
    } catch (e) {
      setApiStatus("Error al cargar datos de comparacion: " + (e instanceof Error ? e.message : String(e)));
      setComparison(null);
    }
  }

  async function fetchTalentBuilds(cls: string, spec: string, ct: ContentType) {
    try {
      const ctParam = ct === "raid" ? "raid" : "mythic_plus";
      const res = await fetch(`/api/compare/archon?classSlug=${cls}&specSlug=${spec}&contentType=${ctParam}`);
      const data = await res.json();
      if (data.success && data.talentBuilds) {
        setTalentBuilds(data.talentBuilds);
      }
    } catch {
      // Talent builds are optional — ignore errors
    }
  }

  async function fetchEncountersForSpec(cls: string, spec: string) {
    try {
      const res = await fetch(`/api/compare/archon?classSlug=${cls}&specSlug=${spec}&contentType=raid&listEncounters=true`);
      const data = await res.json();
      if (data.success && data.encounters) {
        setEncounters(data.encounters);
      }
    } catch {
      // Ignore - encounters won't be available
    }
  }

  // Sort stats by topAvg descending (highest priority first)
  const sortedStats = comparison
    ? [...comparison.stats].sort((a, b) => b.topAvg - a.topAvg)
    : [];

  return (
    <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem", paddingTop: "2rem", paddingBottom: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Comparar <span style={{ color: "var(--primary)" }}>Personaje</span>
      </h1>

      {/* Input Section */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--muted)", marginBottom: "0.5rem" }}>
          Pega el string del addon SimulationCraft (/simc)
        </label>
        <textarea
          value={simcInput}
          onChange={(e) => setSimcInput(e.target.value)}
          placeholder={`mage="TuPersonaje"\nlevel=80\nrace=undead\nregion=eu\nserver=realm-name\nspec=frost\n...`}
          style={{ height: "10rem" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "1rem" }}>
          <button
            onClick={handleParse}
            disabled={loading || !simcInput.trim()}
            style={{
              background: "var(--primary)",
              color: "white",
              fontWeight: 600,
              padding: "0.5rem 1.5rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: loading || !simcInput.trim() ? "not-allowed" : "pointer",
              opacity: loading || !simcInput.trim() ? 0.5 : 1,
              fontSize: "0.875rem",
            }}
          >
            {loading ? "Analizando..." : "Analizar personaje"}
          </button>
          {errors.length > 0 && (
            <div style={{ color: "var(--danger)", fontSize: "0.875rem" }}>
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ color: "var(--warning)", fontSize: "0.75rem" }}>
              {warnings.length} aviso{warnings.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {apiStatus && (
          <div style={{
            marginTop: "0.75rem",
            fontSize: "0.875rem",
            color: apiStatus.toLowerCase().includes("error") || apiStatus.toLowerCase().includes("no se pudieron")
              ? "var(--danger)"
              : apiStatus.toLowerCase().includes("no disponible") || apiStatus.toLowerCase().includes("warning")
                ? "var(--warning)"
                : "var(--muted)",
          }}>
            {apiStatus}
          </div>
        )}
      </div>

      {/* Results */}
      {character && comparison && (
        <div>
          {/* Character Summary Bar */}
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1rem 1.5rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}>
            <div style={{
              width: "3rem",
              height: "3rem",
              background: "rgba(196, 30, 58, 0.15)",
              borderRadius: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--primary)",
              flexShrink: 0,
            }}>
              {character.name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>{character.name}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                {String(character.class)} {character.spec} &middot; {character.race} &middot; {character.server} ({String(character.region).toUpperCase()})
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                {gearCount(character)} items equipados &middot; Nivel {character.level}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Score Global</div>
              <div style={{
                fontSize: "1.875rem",
                fontWeight: 700,
                color: comparison.scores.overall >= 70 ? "var(--success)" : comparison.scores.overall >= 40 ? "var(--warning)" : "var(--danger)",
              }}>
                {comparison.scores.overall}
              </div>
            </div>
          </div>

          {/* Content Type Toggle + Boss Selector */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setContentType("mythic_plus");
                setSelectedBoss("all-bosses");
                if (character) fetchAndCompare(character, "mythic_plus", "all-bosses");
              }}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: contentType === "mythic_plus" ? "var(--primary)" : "var(--card)",
                color: contentType === "mythic_plus" ? "white" : "var(--muted)",
                outline: "none",
              }}
            >
              Mythic+
            </button>
            <button
              onClick={() => {
                setContentType("raid");
                if (character) {
                  fetchEncountersForSpec(character.class, character.spec);
                  fetchAndCompare(character, "raid", "all-bosses");
                }
              }}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: contentType === "raid" ? "var(--primary)" : "var(--card)",
                color: contentType === "raid" ? "white" : "var(--muted)",
                outline: "none",
              }}
            >
              Raid
            </button>

            {/* Boss selector (only in raid mode) */}
            {contentType === "raid" && encounters.length > 0 && (
              <select
                value={selectedBoss}
                onChange={(e) => {
                  const boss = e.target.value;
                  setSelectedBoss(boss);
                  if (character) fetchAndCompare(character, "raid", boss);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  outline: "none",
                  marginLeft: "0.25rem",
                }}
              >
                {encounters.map((enc) => (
                  <option key={enc.value} value={enc.value}>
                    {enc.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.25rem", borderBottom: "2px solid var(--border)", marginBottom: "1.5rem" }}>
            {(["stats", "gear", "talents", "tips"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  border: "none",
                  borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                  background: "none",
                  color: activeTab === tab ? "var(--primary)" : "var(--muted)",
                  cursor: "pointer",
                  marginBottom: "-2px",
                  outline: "none",
                }}
              >
                {tab === "stats" ? "Stats" : tab === "gear" ? "Gear" : tab === "talents" ? "Talentos" : "Recomendaciones"}
              </button>
            ))}
          </div>

          {/* ===== Stats Tab ===== */}
          {activeTab === "stats" && (
            <div>
              {!hasStats(character) && (
                <div style={{
                  background: "rgba(210, 153, 34, 0.1)",
                  border: "1px solid rgba(210, 153, 34, 0.3)",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginBottom: "1rem",
                }}>
                  <p style={{ fontSize: "0.875rem", color: "var(--warning)" }}>
                    No se pudieron obtener tus stats de Blizzard API. Los valores mostrados son 0.
                  </p>
                </div>
              )}

              <div style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "1.5rem",
              }}>
                <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Stat Priority</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>
                  Ordenado por rating promedio de top players. Barras muestran tu valor vs promedio.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {sortedStats.map((stat, index) => {
                    const barPercent = stat.topAvg > 0
                      ? Math.min((stat.userValue / stat.topAvg) * 100, 110)
                      : 0;
                    const barColor = barPercent >= 95
                      ? "var(--success)"
                      : barPercent >= 70
                        ? "var(--warning)"
                        : "var(--danger)";
                    const isPositive = stat.diff >= 0;

                    return (
                      <div key={stat.stat} style={{
                        background: "var(--card-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        padding: "1rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <span style={{
                              background: "var(--primary)",
                              color: "white",
                              width: "1.5rem",
                              height: "1.5rem",
                              borderRadius: "0.25rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}>
                              {index + 1}
                            </span>
                            <span style={{ fontWeight: 500 }}>{stat.stat}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                              Top avg: {stat.topAvg.toLocaleString()}
                            </span>
                            {stat.userValue > 0 ? (
                              <span style={{
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                color: isPositive ? "var(--success)" : "var(--danger)",
                              }}>
                                {isPositive ? "+" : ""}{stat.diff.toLocaleString()} ({isPositive ? "+" : ""}{stat.diffPercent.toFixed(1)}%)
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>Sin datos</span>
                            )}
                          </div>
                        </div>

                        {/* Stat bar */}
                        <div style={{
                          background: "rgba(48, 54, 61, 0.5)",
                          borderRadius: "0.5rem",
                          height: "1.75rem",
                          overflow: "hidden",
                          position: "relative",
                        }}>
                          {stat.userValue > 0 && (
                            <div style={{
                              width: `${Math.min(barPercent, 100)}%`,
                              height: "100%",
                              background: barColor,
                              borderRadius: "0.5rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: "0.5rem",
                              transition: "width 0.6s ease-out",
                            }}>
                              <span style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: "var(--background)",
                              }}>
                                {stat.userValue.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* User vs Top comparison */}
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            Tu: {stat.userValue > 0 ? stat.userValue.toLocaleString() : "—"}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            Top avg: {stat.topAvg.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===== Gear Tab ===== */}
          {activeTab === "gear" && (
            <div>
              {/* Score cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}>
                {[
                  { label: "Stats", score: comparison.scores.stats },
                  { label: "Gear", score: comparison.scores.gear },
                  { label: "Talentos", score: comparison.scores.talents },
                  { label: "Encantos", score: comparison.scores.enchants },
                ].map(({ label, score }) => (
                  <div key={label} style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    padding: "0.75rem",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>{label}</div>
                    <div style={{
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      color: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)",
                    }}>
                      {score}
                    </div>
                    <div style={{
                      height: "0.375rem",
                      background: "var(--border)",
                      borderRadius: "9999px",
                      marginTop: "0.375rem",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${score}%`,
                        height: "100%",
                        borderRadius: "9999px",
                        background: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Gear comparison cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {comparison.gear.map((g) => {
                  const userItem = g.userItem as Record<string, unknown> | null;
                  const userName = userItem?.name as string | undefined;
                  const userId = userItem?.itemId as number | undefined;
                  const userIlvl = userItem?.ilvl as number | undefined;
                  const userEnchant = userItem?.enchantId as number | undefined;
                  const userGems = userItem?.gemIds as number[] | undefined;

                  const topItem = g.topItems[0];
                  const topName = topItem?.name || "—";
                  const topPop = topItem?.popularity || 0;
                  const topPopPct = Math.round(topPop * 100);
                  const isMatch = userId && topItem && userId === topItem.itemId;

                  // Find user item popularity if it exists in top items
                  const userRank = g.topItems.findIndex((ti) => ti.itemId === userId);
                  const userPop = userRank >= 0 ? g.topItems[userRank].popularity : 0;
                  const userPopPct = Math.round(userPop * 100);

                  return (
                    <div key={g.slot} style={{
                      background: "var(--card)",
                      border: `1px solid ${isMatch ? "rgba(63, 185, 80, 0.3)" : "var(--border)"}`,
                      borderRadius: "0.5rem",
                      padding: "0.75rem 1rem",
                      display: "grid",
                      gridTemplateColumns: "7rem 1fr 2.5rem 1fr",
                      gap: "0.75rem",
                      alignItems: "center",
                    }}>
                      {/* Slot name */}
                      <div style={{
                        textTransform: "capitalize",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        color: "var(--muted)",
                      }}>
                        {g.slot.replace(/_/g, " ")}
                      </div>

                      {/* User's item */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {userItem ? (
                          <>
                            {userId ? (
                              <a
                                href={`https://www.wowhead.com/item=${userId}`}
                                data-wh-rename="false"
                                style={{
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                  color: isMatch ? "var(--success)" : "var(--foreground)",
                                  textDecoration: "none",
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {userName || `Item #${userId}`}
                              </a>
                            ) : (
                              <span style={{
                                fontSize: "0.875rem",
                                fontWeight: 500,
                                color: "var(--foreground)",
                              }}>
                                {userName || "—"}
                              </span>
                            )}
                            {userIlvl && (
                              <span style={{
                                fontSize: "0.75rem",
                                color: "var(--muted)",
                                background: "var(--card-hover)",
                                padding: "0.125rem 0.375rem",
                                borderRadius: "0.25rem",
                              }}>
                                {userIlvl}
                              </span>
                            )}
                            {userEnchant && (
                              <span style={{ fontSize: "0.7rem", color: "var(--success)" }} title="Enchanted">E</span>
                            )}
                            {userGems && userGems.length > 0 && (
                              <span style={{ fontSize: "0.7rem", color: "var(--accent)" }} title={`${userGems.length} gem(s)`}>G</span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>Vac&iacute;o</span>
                        )}
                      </div>

                      {/* Arrow */}
                      <div style={{ textAlign: "center", fontSize: "0.875rem", color: isMatch ? "var(--success)" : "var(--muted)" }}>
                        {isMatch ? "=" : "→"}
                      </div>

                      {/* Top item + usage bar */}
                      <div>
                        {topItem ? (
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <a
                                href={`https://www.wowhead.com/item=${topItem.itemId}`}
                                data-wh-rename="false"
                                style={{
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                  color: isMatch ? "var(--success)" : "var(--primary)",
                                  textDecoration: "none",
                                }}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {topName}
                              </a>
                              <span style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: isMatch ? "var(--success)" : topPopPct >= 60 ? "var(--accent)" : "var(--muted)",
                              }}>
                                {topPopPct}%
                              </span>
                            </div>
                            <div style={{
                              height: "0.5rem",
                              background: "rgba(48, 54, 61, 0.5)",
                              borderRadius: "9999px",
                              overflow: "hidden",
                            }}>
                              <div style={{
                                width: `${topPopPct}%`,
                                height: "100%",
                                borderRadius: "9999px",
                                background: isMatch ? "var(--success)" : topPopPct >= 60 ? "var(--primary)" : topPopPct >= 30 ? "var(--warning)" : "var(--muted)",
                                transition: "width 0.5s ease-out",
                              }} />
                            </div>
                            {userItem && !isMatch && userRank >= 0 && (
                              <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.125rem" }}>
                                Tu item: {userPopPct}% de popularidad (#{userRank + 1})
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>Sin datos</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Talents Tab ===== */}
          {activeTab === "talents" && (
            <div>
              <div style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "1.5rem",
              }}>
                <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Builds de Talentos</h3>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>
                  Builds mas populares de top players segun archon.gg. {contentType === "raid" && selectedBoss !== "all-bosses" ? `Datos para ${selectedBoss}.` : ""}
                </p>

                {talentBuilds.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem" }}>
                    <p style={{ color: "var(--muted)" }}>No hay datos de talentos disponibles.</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                      Los datos de talentos se cargan desde archon.gg.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {talentBuilds.map((build, idx) => {
                      // popularity can be string like "28.8%" or number
                      const popNum = typeof build.popularity === "string"
                        ? parseFloat(build.popularity)
                        : build.popularity;
                      const popPct = Math.round(popNum);

                      // Wowhead talent calculator uses exportCode from archon.gg
                      const wowheadUrl = build.exportCode
                        ? `https://www.wowhead.com/talent-calculator#export/${build.exportCode}`
                        : null;

                      return (
                        <div key={idx} style={{
                          background: "var(--card-hover)",
                          border: `1px solid ${idx === 0 ? "rgba(63, 185, 80, 0.3)" : "var(--border)"}`,
                          borderRadius: "0.5rem",
                          padding: "1rem",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              {idx === 0 && (
                                <span style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "0.25rem",
                                  background: "rgba(63, 185, 80, 0.15)",
                                  color: "var(--success)",
                                  textTransform: "uppercase",
                                }}>
                                  Top
                                </span>
                              )}
                              <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                                {build.title || `Build ${idx + 1}`}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                color: popPct >= 50 ? "var(--success)" : popPct >= 20 ? "var(--warning)" : "var(--muted)",
                              }}>
                                {popPct}%
                              </span>
                              {wowheadUrl && (
                                <a
                                  href={wowheadUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--primary)",
                                    textDecoration: "none",
                                    padding: "0.25rem 0.5rem",
                                    border: "1px solid var(--primary)",
                                    borderRadius: "0.25rem",
                                  }}
                                >
                                  Wowhead
                                </a>
                              )}
                              {build.reportUrl && (
                                <a
                                  href={build.reportUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--muted)",
                                    textDecoration: "none",
                                    padding: "0.25rem 0.5rem",
                                    border: "1px solid var(--border)",
                                    borderRadius: "0.25rem",
                                  }}
                                >
                                  WCL Log
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Popularity bar */}
                          <div style={{
                            height: "0.375rem",
                            background: "rgba(48, 54, 61, 0.5)",
                            borderRadius: "9999px",
                            overflow: "hidden",
                            marginBottom: "0.75rem",
                          }}>
                            <div style={{
                              width: `${popPct}%`,
                              height: "100%",
                              borderRadius: "9999px",
                              background: popPct >= 50 ? "var(--success)" : popPct >= 20 ? "var(--primary)" : "var(--warning)",
                              transition: "width 0.5s ease-out",
                            }} />
                          </div>

                          {/* Metric tiles */}
                          {build.metricTiles && build.metricTiles.length > 0 && (
                            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem" }}>
                              {build.metricTiles.map((tile, ti) => (
                                <div key={ti}>
                                  <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{tile.label}: </span>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{tile.value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Export code (copyable) */}
                          {build.exportCode && (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.5rem",
                              background: "rgba(0,0,0,0.2)",
                              borderRadius: "0.25rem",
                              fontSize: "0.75rem",
                            }}>
                              <code style={{
                                flex: 1,
                                color: "var(--muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {build.exportCode}
                              </code>
                              <button
                                onClick={() => navigator.clipboard?.writeText(build.exportCode!)}
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.2rem 0.5rem",
                                  border: "1px solid var(--border)",
                                  borderRadius: "0.25rem",
                                  background: "var(--card)",
                                  color: "var(--muted)",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                }}
                              >
                                Copiar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== Tips/Recommendations Tab ===== */}
          {activeTab === "tips" && (
            <div>
              {comparison.recommendations.length > 0 ? (
                <div style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "1.5rem",
                }}>
                  <h3 style={{ fontWeight: 600, marginBottom: "1rem" }}>Recomendaciones</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {comparison.recommendations.slice(0, 10).map((rec, i) => {
                      const severity = rec.severity;
                      const severityColor = severity === "high" ? "var(--danger)" : severity === "medium" ? "var(--warning)" : "var(--muted)";
                      const severityBg = severity === "high" ? "rgba(248,81,73,0.05)" : severity === "medium" ? "rgba(210,153,34,0.05)" : "rgba(139,148,158,0.05)";
                      const severityBorder = severity === "high" ? "rgba(248,81,73,0.3)" : severity === "medium" ? "rgba(210,153,34,0.3)" : "var(--border)";
                      const severityLabel = severity === "high" ? "ALTO" : severity === "medium" ? "MED" : "BAJO";

                      return (
                        <div key={i} style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.75rem",
                          padding: "0.75rem",
                          borderRadius: "0.5rem",
                          border: `1px solid ${severityBorder}`,
                          background: severityBg,
                        }}>
                          <span style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.125rem 0.5rem",
                            borderRadius: "0.25rem",
                            background: severity === "high" ? "rgba(248,81,73,0.2)" : severity === "medium" ? "rgba(210,153,34,0.2)" : "rgba(139,148,158,0.2)",
                            color: severityColor,
                            flexShrink: 0,
                          }}>
                            {severityLabel}
                          </span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: "0.875rem" }}>{rec.message}</p>
                            {rec.currentValue && rec.recommendedValue && (
                              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                                Actual: {rec.currentValue} → Recomendado: {rec.recommendedValue}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "2rem",
                  textAlign: "center",
                }}>
                  <p style={{ color: "var(--success)", fontWeight: 500 }}>No hay recomendaciones pendientes.</p>
                  <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                    Tu personaje esta bien optimizado segun los datos de top players.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Consumables — shown below tabs */}
      {character && comparison && consumables && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1.5rem",
          }}>
            <h3 style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Consumibles</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Frasco, comida, potis y aceite mas usados por top players
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {[
                { label: "Frasco", items: consumables.flasks, icon: "\u{1F3EA}" },
                { label: "Comida", items: consumables.food, icon: "\u{1F35C}" },
                { label: "Potion de Combate", items: consumables.combatPotions, icon: "\u{1F9EA}" },
                { label: "Aceite / Arma", items: consumables.weaponBuffs, icon: "\u{1F48E}" },
              ].map((cat) => (
                <CompareConsumableCategory key={cat.label} label={cat.label} icon={cat.icon} items={cat.items} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* M+ Compositions — shown below tabs for M+ content type */}
      {character && contentType === "mythic_plus" && comparison && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1.5rem",
          }}>
            <h3 style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Composiciones M+</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Grupos mas comunes con {character.spec} {character.class} en keys +10
            </p>
            {!composition || composition.compositions.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", textAlign: "center", padding: "1rem" }}>
                {composition === null ? "Cargando datos de composicion..." : "No hay datos de composiciones disponibles"}
              </p>
            ) : (
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  Basado en {composition.totalRuns} runs analizadas
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {composition.compositions.map((comp, idx) => (
                    <CompCard key={idx} comp={comp} idx={idx} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// WoW class colors
const COMP_CLASS_COLORS: Record<string, string> = {
  DeathKnight: "#c41f3b",
  DemonHunter: "#a330c9",
  Druid: "#ff7d0a",
  Evoker: "#33937f",
  Hunter: "#abd473",
  Mage: "#69ccf0",
  Monk: "#00ff96",
  Paladin: "#f58cba",
  Priest: "#ffffff",
  Rogue: "#fff569",
  Shaman: "#0070de",
  Warlock: "#9482c9",
  Warrior: "#c79c6e",
};

const COMP_ROLE_ICONS: Record<string, string> = {
  tank: "\u{1F6E1}\uFE0F",
  healer: "\u2764\uFE0F",
  dps: "\u2694\uFE0F",
};

function CompCard({ comp, idx }: { comp: CompositionEntry; idx: number }) {
  const allPlayers = [
    { ...comp.tank, roleIcon: COMP_ROLE_ICONS.tank },
    { ...comp.healer, roleIcon: COMP_ROLE_ICONS.healer },
    ...comp.dps.map((d) => ({ ...d, roleIcon: COMP_ROLE_ICONS.dps })),
  ];

  return (
    <div style={{
      background: "var(--card-hover)",
      border: `1px solid ${idx === 0 ? "rgba(63, 185, 80, 0.3)" : "var(--border)"}`,
      borderRadius: "0.5rem",
      padding: "0.75rem 1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{
            fontSize: "0.75rem", fontWeight: 700,
            color: idx === 0 ? "var(--success)" : "var(--primary)",
          }}>
            #{idx + 1}
          </span>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {allPlayers.map((p, i) => (
              <span
                key={i}
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  padding: "0.125rem 0.5rem",
                  borderRadius: "0.25rem",
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid " + (COMP_CLASS_COLORS[p.className] || "var(--border)"),
                  color: COMP_CLASS_COLORS[p.className] || "var(--foreground)",
                }}
              >
                {p.roleIcon} {p.specName}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--accent)" }}>
            {comp.percentage}%
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
            +{comp.avgKeystoneLevel} avg ({comp.count} runs)
          </div>
        </div>
      </div>
      <div style={{
        height: "0.375rem", background: "rgba(48, 54, 61, 0.5)",
        borderRadius: "9999px", overflow: "hidden",
      }}>
        <div style={{
          width: `${comp.percentage}%`, height: "100%", borderRadius: "9999px",
          background: idx === 0 ? "var(--success)" : idx < 3 ? "var(--primary)" : "var(--warning)",
        }} />
      </div>
    </div>
  );
}

interface ConsumableItemData {
  itemId: number;
  name: string;
  popularity: number;
}

function CompareConsumableCategory({ label, icon, items }: { label: string; icon: string; items: ConsumableItemData[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {icon} {label}
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {items.slice(0, 5).map((item, i) => (
          <div key={item.itemId} style={{
            background: "var(--card-hover)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            padding: "0.5rem 0.75rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <a
              href={`https://www.wowhead.com/item=${item.itemId}`}
              data-wh-rename="false"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "0.8125rem",
                fontWeight: i === 0 ? 600 : 400,
                color: i === 0 ? "var(--accent)" : "var(--foreground)",
                textDecoration: "none",
              }}
            >
              {item.name}
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: "4rem", height: "0.375rem",
                background: "rgba(48, 54, 61, 0.5)",
                borderRadius: "9999px", overflow: "hidden",
              }}>
                <div style={{
                  width: `${item.popularity}%`, height: "100%",
                  borderRadius: "9999px",
                  background: i === 0 ? "var(--success)" : "var(--primary)",
                }} />
              </div>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700,
                color: i === 0 ? "var(--success)" : "var(--muted)",
                width: "3rem", textAlign: "right",
              }}>
                {Math.round(item.popularity)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
