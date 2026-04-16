"use client";

import { useState } from "react";
import { parseSimCString } from "@/lib/simc/parser";
import type { SimCCharacterOutput } from "@/lib/simc/parser.types";
import type { ParseWarning } from "@/lib/simc/parser.types";
import type { ComparisonResult } from "@/types/comparison";
import type { ContentType } from "@/types/wow";
import { GEAR_SLOTS } from "@/types/wow";

export default function ComparePage() {
  const [simcInput, setSimcInput] = useState("");
  const [character, setCharacter] = useState<SimCCharacterOutput | null>(null);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [contentType, setContentType] = useState<ContentType>("mythic_plus");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [activeTab, setActiveTab] = useState<"stats" | "gear" | "summary">("stats");
  const [loading, setLoading] = useState(false);

  function handleParse() {
    setLoading(true);
    setErrors([]);
    setWarnings([]);

    try {
      const result = parseSimCString(simcInput);

      if (!result.success) {
        setErrors(result.errors);
        setLoading(false);
        return;
      }

      setCharacter(result.character!);
      setWarnings(result.warnings);

      // For MVP: generate mock comparison data since we don't have the DB seeded yet
      // In production, this would fetch from /api/rankings/[class]/[spec]
      generateMockComparison(result.character!, contentType);
    } catch {
      setErrors(["Error parsing SimC string"]);
    } finally {
      setLoading(false);
    }
  }

  function generateMockComparison(char: SimCCharacterOutput, ct: ContentType) {
    // Generate realistic mock aggregate data for comparison
    const mockStats = {
      critRating: { avg: char.stats.critRating * 1.1, p25: char.stats.critRating * 0.85, p50: char.stats.critRating * 1.0, p75: char.stats.critRating * 1.2, p100: char.stats.critRating * 1.4 },
      hasteRating: { avg: char.stats.hasteRating * 1.05, p25: char.stats.hasteRating * 0.8, p50: char.stats.hasteRating * 1.0, p75: char.stats.hasteRating * 1.15, p100: char.stats.hasteRating * 1.35 },
      masteryRating: { avg: char.stats.masteryRating * 1.15, p25: char.stats.masteryRating * 0.9, p50: char.stats.masteryRating * 1.1, p75: char.stats.masteryRating * 1.25, p100: char.stats.masteryRating * 1.5 },
      versatilityRating: { avg: char.stats.versatilityRating * 1.08, p25: char.stats.versatilityRating * 0.85, p50: char.stats.versatilityRating * 1.0, p75: char.stats.versatilityRating * 1.2, p100: char.stats.versatilityRating * 1.4 },
    };

    const STAT_LABELS: Record<string, string> = {
      critRating: "Critical Strike",
      hasteRating: "Haste",
      masteryRating: "Mastery",
      versatilityRating: "Versatility",
    };

    const STAT_COLORS: Record<string, string> = {
      critRating: "#ff6b6b",
      hasteRating: "#4ecdc4",
      masteryRating: "#a78bfa",
      versatilityRating: "#60a5fa",
    };

    const statResults = Object.entries(mockStats).map(([key, data]) => {
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
        stat: STAT_LABELS[key] || key,
        userValue,
        topAvg: Math.round(data.avg),
        topP25: Math.round(data.p25),
        topP50: Math.round(data.p50),
        topP75: Math.round(data.p75),
        topP100: Math.round(data.p100),
        percentile: Math.max(0, Math.min(100, Math.round(percentile))),
        diff: Math.round(diff),
        diffPercent: Math.round(diffPercent * 10) / 10,
      };
    });

    const gearResults = GEAR_SLOTS.map((slot) => {
      const userItem = char.gear[slot] || null;
      const score = userItem ? 50 + Math.floor(Math.random() * 50) : 0;
      return {
        slot,
        userItem,
        topItems: userItem
          ? [{ itemId: userItem.itemId + 100, name: `Top ${slot} Item`, popularity: 0.72, avgIlvl: userItem.ilvl + 3 }]
          : [],
        score,
        isMatch: score > 80,
        isUpgrade: score < 50,
      };
    });

    const avgStatScore = statResults.reduce((s, r) => s + r.percentile, 0) / Math.max(statResults.length, 1);
    const avgGearScore = gearResults.reduce((s, r) => s + r.score, 0) / Math.max(gearResults.length, 1);

    const result: ComparisonResult = {
      contentType: ct,
      scores: {
        stats: Math.round(avgStatScore),
        gear: Math.round(avgGearScore),
        talents: 0,
        enchants: 0,
        overall: Math.round(avgStatScore * 0.2 + avgGearScore * 0.35),
      },
      stats: statResults,
      gear: gearResults,
      talents: [],
      recommendations: statResults
        .filter((s) => s.diffPercent < -10)
        .map((s) => ({
          type: "stat" as const,
          severity: s.diffPercent < -20 ? ("high" as const) : ("medium" as const),
          message: `Tu ${s.stat} esta ${Math.abs(s.diffPercent).toFixed(1)}% por debajo del promedio de top players`,
          currentValue: s.userValue.toString(),
          recommendedValue: s.topAvg.toString(),
        })),
    };

    setComparison(result);
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
            <div className="text-danger text-sm">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="text-warning text-xs">
              {warnings.length} aviso{warnings.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
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
            <button
              onClick={() => setContentType("mythic_plus")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentType === "mythic_plus" ? "bg-primary text-white" : "bg-card border border-border text-muted hover:text-foreground"}`}
            >
              Mythic+
            </button>
            <button
              onClick={() => setContentType("raid")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentType === "raid" ? "bg-primary text-white" : "bg-card border border-border text-muted hover:text-foreground"}`}
            >
              Raid
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-6">
            {(["summary", "stats", "gear"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
              >
                {tab === "summary" ? "Resumen" : tab === "stats" ? "Stats" : "Gear"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* Score Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Stats", score: comparison.scores.stats, icon: "chart" },
                  { label: "Gear", score: comparison.scores.gear, icon: "gear" },
                  { label: "Talentos", score: comparison.scores.talents, icon: "talent" },
                  { label: "Encantos", score: comparison.scores.enchants, icon: "enchant" },
                ].map(({ label, score }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-4">
                    <div className="text-xs text-muted mb-1">{label}</div>
                    <div className={`text-2xl font-bold ${score >= 70 ? "text-success" : score >= 40 ? "text-warning" : "text-danger"}`}>
                      {score}
                    </div>
                    <div className="w-full bg-border rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full stat-bar-fill ${score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger"}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommendations */}
              {comparison.recommendations.length > 0 && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">Recomendaciones</h3>
                  <div className="space-y-2">
                    {comparison.recommendations.slice(0, 5).map((rec, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${rec.severity === "high" ? "border-danger/30 bg-danger/5" : rec.severity === "medium" ? "border-warning/30 bg-warning/5" : "border-border"}`}
                      >
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

          {activeTab === "stats" && (
            <div className="space-y-4">
              {comparison.stats.map((stat) => (
                <div key={stat.stat} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{stat.stat}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted">Top avg: {stat.topAvg.toLocaleString()}</span>
                      <span className={`text-sm font-semibold ${stat.diff >= 0 ? "text-success" : "text-danger"}`}>
                        {stat.diff >= 0 ? "+" : ""}{stat.diff.toLocaleString()} ({stat.diffPercent >= 0 ? "+" : ""}{stat.diffPercent}%)
                      </span>
                    </div>
                  </div>
                  {/* Stat bar visualization */}
                  <div className="relative h-8 bg-border/30 rounded-lg overflow-hidden">
                    {/* Top player range background */}
                    <div
                      className="absolute inset-y-0 left-0 bg-muted/10 rounded-lg"
                      style={{ width: `${Math.min((stat.topP100 / Math.max(stat.topP100, stat.userValue)) * 100, 100)}%` }}
                    />
                    {/* User value bar */}
                    <div
                      className="absolute inset-y-0 left-0 stat-bar-fill rounded-lg flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.min((stat.userValue / Math.max(stat.topP100, stat.userValue)) * 100, 100)}%`,
                        backgroundColor: stat.percentile >= 70 ? "var(--stat-haste)" : stat.percentile >= 40 ? "var(--warning)" : "var(--danger)",
                      }}
                    >
                      <span className="text-xs font-bold text-background">{stat.userValue.toLocaleString()}</span>
                    </div>
                  </div>
                  {/* Percentile markers */}
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

          {activeTab === "gear" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Slot</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Tu Item</th>
                    <th className="text-left text-xs text-muted font-medium px-4 py-3">Top Item</th>
                    <th className="text-right text-xs text-muted font-medium px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.gear.map((g) => (
                    <tr key={g.slot} className="border-b border-border/50 hover:bg-card-hover">
                      <td className="px-4 py-3 text-sm font-medium capitalize">{g.slot.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-sm">
                        {g.userItem ? (
                          <span>
                            <span className="quality-epic">Item #{g.userItem.itemId}</span>
                            <span className="text-muted ml-2">ilvl {g.userItem.ilvl}</span>
                            {g.userItem.enchantId && <span className="text-success ml-2 text-xs">E</span>}
                            {g.userItem.gemIds && g.userItem.gemIds.length > 0 && <span className="text-accent ml-1 text-xs">G</span>}
                          </span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {g.topItems.length > 0 ? (
                          <span>
                            <span className="text-foreground">{g.topItems[0].name}</span>
                            <span className="text-muted ml-2">ilvl {g.topItems[0].avgIlvl}</span>
                            <span className="text-muted ml-2 text-xs">({(g.topItems[0].popularity * 100).toFixed(0)}%)</span>
                          </span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold ${g.score >= 70 ? "text-success" : g.score >= 40 ? "text-warning" : "text-danger"}`}>
                          {g.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
