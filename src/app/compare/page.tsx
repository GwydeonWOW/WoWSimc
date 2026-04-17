"use client";

import { useState } from "react";
import { parseSimCString } from "@/lib/simc/parser";
import type { SimCCharacterOutput } from "@/lib/simc/parser.types";
import type { ParseWarning } from "@/lib/simc/parser.types";
import type { ComparisonResult } from "@/types/comparison";
import type { ContentType } from "@/types/wow";
import { CURRENT_SEASON, GEAR_SLOTS } from "@/types/wow";

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
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "gear" | "tips">("stats");
  const [loading, setLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<string>("");

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
      await fetchAndCompare(char, contentType);
    } catch {
      setErrors(["Error parsing SimC string"]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAndCompare(char: SimCCharacterOutput, ct: ContentType) {
    setApiStatus((prev) => prev || "Cargando datos de top players...");
    setComparison(null);

    try {
      const res = await fetch(
        `/api/compare/aggregate?classSlug=${char.class}&specSlug=${char.spec}&contentType=${ct}&season=${CURRENT_SEASON}`
      );
      const data = await res.json();

      if (data.success && data.aggregate) {
        const compRes = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: char, aggregate: data.aggregate, contentType: ct }),
        });
        const compData = await compRes.json();

        if (compData.success) {
          setComparison(compData.result);
          setApiStatus("");
          return;
        }
      }

      // No aggregate data — try on-demand sync
      setApiStatus("No hay datos de top players. Sincronizando desde Raider.IO...");
      try {
        const syncRes = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classSlug: char.class,
            specSlug: char.spec,
            contentType: ct,
          }),
        });
        const syncData = await syncRes.json();

        if (syncData.success && syncData.synced > 0) {
          const aggRes2 = await fetch(
            `/api/compare/aggregate?classSlug=${char.class}&specSlug=${char.spec}&contentType=${ct}&season=${CURRENT_SEASON}`
          );
          const aggData2 = await aggRes2.json();

          if (aggData2.success && aggData2.aggregate) {
            const compRes2 = await fetch("/api/compare", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ character: char, aggregate: aggData2.aggregate, contentType: ct }),
            });
            const compData2 = await compRes2.json();

            if (compData2.success) {
              setComparison(compData2.result);
              setApiStatus(`Comparado contra ${syncData.synced} top players`);
              return;
            }
          }
        }
      } catch {
        // Sync failed, fall through
      }

      setApiStatus(`No se pudieron obtener datos de top players para ${char.class} ${char.spec}. Verifica la conexion a la base de datos y que las APIs esten configuradas.`);
      setComparison(null);
    } catch (e) {
      setApiStatus("Error al cargar datos de comparacion: " + (e instanceof Error ? e.message : String(e)));
      setComparison(null);
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

          {/* Content Type Toggle */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              onClick={() => { setContentType("mythic_plus"); if (character) fetchAndCompare(character, "mythic_plus"); }}
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
              onClick={() => { setContentType("raid"); if (character) fetchAndCompare(character, "raid"); }}
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
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.25rem", borderBottom: "2px solid var(--border)", marginBottom: "1.5rem" }}>
            {(["stats", "gear", "tips"] as const).map((tab) => (
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
                {tab === "stats" ? "Stats" : tab === "gear" ? "Gear" : "Recomendaciones"}
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

              {/* Gear table */}
              <div style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "0.75rem 1rem" }}>Slot</th>
                      <th style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "0.75rem 1rem" }}>Tu Item</th>
                      <th style={{ textAlign: "right", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "0.75rem 1rem" }}>ilvl</th>
                      <th style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "0.75rem 1rem" }}>Enc</th>
                      <th style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500, padding: "0.75rem 1rem" }}>Gema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.gear.map((g) => {
                      const item = g.userItem as Record<string, unknown> | null;
                      const itemName = item?.name as string | undefined;
                      const itemId = item?.itemId as number | undefined;
                      const ilvl = item?.ilvl as number | undefined;
                      const enchantId = item?.enchantId as number | undefined;
                      const gemIds = item?.gemIds as number[] | undefined;
                      return (
                        <tr key={g.slot} style={{ borderBottom: "1px solid rgba(48, 54, 61, 0.5)" }}>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", fontWeight: 500, textTransform: "capitalize" }}>
                            {g.slot.replace(/_/g, " ")}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                            {item ? (
                              <span className="quality-epic">{itemName || `Item #${itemId}`}</span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", textAlign: "right" }}>
                            {ilvl ? (
                              <span style={{
                                fontWeight: 600,
                                color: ilvl >= 285 ? "var(--accent)" : ilvl >= 276 ? "var(--foreground)" : "var(--muted)",
                              }}>
                                {ilvl}
                              </span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", textAlign: "center" }}>
                            {enchantId ? (
                              <span style={{ color: "var(--success)" }}>Si</span>
                            ) : item ? (
                              <span style={{ color: "var(--danger)" }}>No</span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", textAlign: "center" }}>
                            {gemIds && gemIds.length > 0 ? (
                              <span style={{ color: "var(--accent)" }}>{gemIds.length}</span>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
    </div>
  );
}
