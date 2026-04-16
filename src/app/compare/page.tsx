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
  const [activeTab, setActiveTab] = useState<"summary" | "stats" | "gear">("gear");
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
        // Use the server-side comparison engine via API
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

      // No aggregate data — try on-demand sync for this spec
      setApiStatus("No hay datos de top players. Sincronizando...");
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
          // Re-fetch aggregate after sync
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

      // Final fallback: generate local comparison with mock top data
      setApiStatus("Datos de top players no disponibles. Mostrando comparacion estimada.");
      setComparison(generateFallbackComparison(char, ct));
    } catch {
      setApiStatus("Error al cargar datos de comparacion");
      setComparison(generateFallbackComparison(char, ct));
    }
  }

  function generateFallbackComparison(char: SimCCharacterOutput, ct: ContentType): ComparisonResult {
    const mockTopStats = {
      critRating: { avg: 9200, p25: 7800, p50: 9000, p75: 10400, p100: 12500 },
      hasteRating: { avg: 7600, p25: 6200, p50: 7500, p75: 8800, p100: 10200 },
      masteryRating: { avg: 8100, p25: 6500, p50: 8000, p75: 9500, p100: 11500 },
      versatilityRating: { avg: 5900, p25: 4600, p50: 5800, p75: 7100, p100: 8500 },
    };

    const STAT_LABELS: Record<string, string> = {
      critRating: "Critical Strike", hasteRating: "Haste",
      masteryRating: "Mastery", versatilityRating: "Versatility",
    };

    const statResults = Object.entries(mockTopStats).map(([key, data]) => {
      const userValue = char.stats[key as keyof typeof char.stats] || 0;
      const diff = userValue - data.avg;
      const diffPercent = data.avg > 0 ? (diff / data.avg) * 100 : 0;
      let percentile = 50;
      if (userValue >= data.p100) percentile = 100;
      else if (userValue >= data.p75) percentile = 75 + ((userValue - data.p75) / (data.p100 - data.p75)) * 25;
      else if (userValue >= data.p50) percentile = 50 + ((userValue - data.p50) / (data.p75 - data.p50)) * 25;
      else if (userValue >= data.p25) percentile = 25 + ((userValue - data.p25) / (data.p50 - data.p25)) * 25;
      else percentile = (userValue / Math.max(data.p25, 1)) * 25;

      return {
        stat: STAT_LABELS[key] || key, userValue,
        topAvg: Math.round(data.avg), topP25: data.p25, topP50: data.p50, topP75: data.p75, topP100: data.p100,
        percentile: Math.max(0, Math.min(100, Math.round(percentile))),
        diff: Math.round(diff), diffPercent: Math.round(diffPercent * 10) / 10,
      };
    });

    const gearResults = GEAR_SLOTS.map((slot) => {
      const userItem = char.gear[slot] || null;
      const score = userItem ? 50 + Math.floor(Math.random() * 50) : 0;
      const itemName = (userItem as Record<string, unknown>)?.name as string | undefined;
      return {
        slot, userItem: userItem ? { ...userItem, name: itemName } : null,
        topItems: userItem ? [{ itemId: userItem.itemId + 100, name: `Top ${slot} Item`, popularity: 0.72, avgIlvl: Math.max(userItem.ilvl, 280) + 3 }] : [],
        score, isMatch: score > 80, isUpgrade: score < 50,
      };
    });

    const statsAvailable = hasStats(char);
    const avgStatScore = statsAvailable ? statResults.reduce((s, r) => s + r.percentile, 0) / 4 : 0;
    const avgGearScore = gearResults.reduce((s, r) => s + r.score, 0) / gearResults.length;

    return {
      contentType: ct,
      scores: {
        stats: Math.round(avgStatScore), gear: Math.round(avgGearScore),
        talents: 0, enchants: 0, overall: Math.round(avgStatScore * 0.2 + avgGearScore * 0.35 + 15),
      },
      stats: statResults, gear: gearResults, talents: [],
      recommendations: statsAvailable ? statResults
        .filter((s) => s.diffPercent < -10)
        .map((s) => ({
          type: "stat" as const, severity: s.diffPercent < -20 ? ("high" as const) : ("medium" as const),
          message: `Tu ${s.stat} esta ${Math.abs(s.diffPercent).toFixed(1)}% por debajo del promedio de top players`,
          currentValue: s.userValue.toString(), recommendedValue: s.topAvg.toString(),
        })) : [],
    };
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        Comparar <span className="text-primary">Personaje</span>
      </h1>

      {/* Input Section */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <label className="block text-sm font-medium text-muted mb-2">
          Pega el string del addon SimulationCraft (/simc)
        </label>
        <textarea
          value={simcInput}
          onChange={(e) => setSimcInput(e.target.value)}
          placeholder={`mage="TuPersonaje"\nlevel=80\nrace=undead\nregion=eu\nserver=realm-name\nspec=frost\n...`}
          className="w-full h-48 bg-background border border-border rounded-lg p-4 text-sm font-mono text-foreground placeholder-muted/50 focus:outline-none focus:border-primary resize-vertical"
        />
        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={handleParse}
            disabled={loading || !simcInput.trim()}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {loading ? "Analizando..." : "Analizar personaje"}
          </button>
          {errors.length > 0 && (
            <div className="text-danger text-sm">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>
          )}
          {warnings.length > 0 && (
            <div className="text-warning text-xs">{warnings.length} aviso{warnings.length !== 1 ? "s" : ""}</div>
          )}
        </div>
        {apiStatus && (
          <div className={`mt-3 text-sm ${apiStatus.includes("Error") || apiStatus.includes("error") ? "text-danger" : apiStatus.includes("no disponible") || apiStatus.includes("estimada") ? "text-warning" : "text-muted"}`}>
            {apiStatus}
          </div>
        )}
      </div>

      {/* Results */}
      {character && comparison && (
        <div>
          {/* Character Summary */}
          <div className="bg-card border border-border rounded-lg p-4 mb-6 flex items-center gap-6">
            <div className="w-16 h-16 bg-primary/20 rounded-lg flex items-center justify-center text-2xl font-bold text-primary">
              {character.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{character.name}</h2>
              <p className="text-sm text-muted">
                {String(character.class)} {character.spec} - {character.race} - {character.server} ({String(character.region).toUpperCase()})
              </p>
              <p className="text-xs text-muted mt-1">{gearCount(character)} items equipados | Nivel {character.level}</p>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm text-muted">Score Global</div>
              <div className={`text-3xl font-bold ${comparison.scores.overall >= 70 ? "text-success" : comparison.scores.overall >= 40 ? "text-warning" : "text-danger"}`}>
                {comparison.scores.overall}
              </div>
            </div>
          </div>

          {/* Content Type Toggle */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setContentType("mythic_plus"); if (character) fetchAndCompare(character, "mythic_plus"); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentType === "mythic_plus" ? "bg-primary text-white" : "bg-card border border-border text-muted hover:text-foreground"}`}>
              Mythic+
            </button>
            <button onClick={() => { setContentType("raid"); if (character) fetchAndCompare(character, "raid"); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentType === "raid" ? "bg-primary text-white" : "bg-card border border-border text-muted hover:text-foreground"}`}>
              Raid
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-6">
            {(["summary", "stats", "gear"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>
                {tab === "summary" ? "Resumen" : tab === "stats" ? "Stats" : "Gear"}
              </button>
            ))}
          </div>

          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Stats", score: comparison.scores.stats },
                  { label: "Gear", score: comparison.scores.gear },
                  { label: "Talentos", score: comparison.scores.talents },
                  { label: "Encantos", score: comparison.scores.enchants },
                ].map(({ label, score }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-4">
                    <div className="text-xs text-muted mb-1">{label}</div>
                    <div className={`text-2xl font-bold ${score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-danger"}`}>{score}</div>
                    <div className="w-full bg-border rounded-full h-1.5 mt-2">
                      <div className={`h-1.5 rounded-full stat-bar-fill ${score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger"}`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {comparison.recommendations.length > 0 && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Recomendaciones</h3>
                  <div className="space-y-2">
                    {comparison.recommendations.slice(0, 8).map((rec, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${rec.severity === "high" ? "border-danger/30 bg-danger/5" : rec.severity === "medium" ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${rec.severity === "high" ? "bg-danger/20 text-danger" : rec.severity === "medium" ? "bg-warning/20 text-warning" : "bg-muted/20 text-muted"}`}>
                          {rec.severity === "high" ? "ALTO" : rec.severity === "medium" ? "MED" : "BAJO"}
                        </span>
                        <p className="text-sm">{rec.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === "stats" && (
            <div className="space-y-4">
              {!hasStats(character) && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-4">
                  <p className="text-sm text-warning">No se pudieron obtener tus stats de Blizzard API.</p>
                </div>
              )}
              {comparison.stats.map((stat) => (
                <div key={stat.stat} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{stat.stat}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted">Top avg: {stat.topAvg.toLocaleString()}</span>
                      {stat.userValue > 0 ? (
                        <span className={`text-sm font-semibold ${stat.diff >= 0 ? "text-success" : "text-danger"}`}>
                          {stat.diff >= 0 ? "+" : ""}{stat.diff.toLocaleString()} ({stat.diffPercent >= 0 ? "+" : ""}{stat.diffPercent}%)
                        </span>
                      ) : <span className="text-sm text-muted">--</span>}
                    </div>
                  </div>
                  <div className="relative h-8 bg-border/30 rounded-lg overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-muted/10 rounded-lg" style={{ width: "100%" }} />
                    {stat.userValue > 0 && (
                      <div className="absolute inset-y-0 left-0 stat-bar-fill rounded-lg flex items-center justify-end pr-2"
                        style={{ width: `${Math.min((stat.userValue / Math.max(stat.topP100, 1)) * 100, 100)}%`, backgroundColor: stat.percentile >= 70 ? "var(--success)" : stat.percentile >= 40 ? "var(--warning)" : "var(--danger)" }}>
                        <span className="text-xs font-bold text-background">{stat.userValue.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>P25: {stat.topP25.toLocaleString()}</span>
                    <span>P50: {stat.topP50.toLocaleString()}</span>
                    <span>P75: {stat.topP75.toLocaleString()}</span>
                    <span>P100: {stat.topP100.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Gear Tab */}
          {activeTab === "gear" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Slot</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Tu Item</th>
                    <th className="text-right text-xs text-muted font-medium px-4 py-3">ilvl</th>
                    <th className="text-center text-xs text-muted font-medium px-4 py-3">Enc</th>
                    <th className="text-center text-xs text-muted font-medium px-4 py-3">Gema</th>
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
                      <tr key={g.slot} className="border-b border-border/50 hover:bg-card-hover">
                        <td className="px-4 py-3 text-sm font-medium capitalize">{g.slot.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-sm">
                          {item ? <span className="quality-epic">{itemName || `Item #${itemId}`}</span> : <span className="text-muted">--</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {ilvl ? <span className={`font-semibold ${ilvl >= 285 ? "text-accent" : ilvl >= 276 ? "text-foreground" : "text-muted"}`}>{ilvl}</span> : <span className="text-muted">--</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {enchantId ? <span className="text-success">Si</span> : item ? <span className="text-danger">No</span> : <span className="text-muted">--</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {gemIds && gemIds.length > 0 ? <span className="text-accent">{gemIds.length}</span> : item ? <span className="text-muted">--</span> : <span className="text-muted">--</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
