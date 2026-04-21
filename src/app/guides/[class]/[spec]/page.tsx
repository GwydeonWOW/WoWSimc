"use client";

import { useState, useEffect, useCallback } from "react";
import { CLASS_INFO } from "@/types/wow";
import { notFound } from "next/navigation";
import type { ArchonPageData, ArchonTalentBuild } from "@/lib/api/archon";

interface PageProps {
  params: Promise<{ class: string; spec: string }>;
}

interface EncounterOption {
  value: string;
  label: string;
}

const STAT_LABELS: Record<string, string> = {
  Crit: "Critical Strike",
  Haste: "Haste",
  Mastery: "Mastery",
  Vers: "Versatility",
};

const SLOT_ORDER = [
  "head", "neck", "shoulder", "back", "chest", "wrist",
  "hands", "waist", "legs", "feet", "finger1", "finger2",
  "trinket1", "trinket2", "main_hand",
];

export default function GuidePage({ params }: PageProps) {
  const [resolved, setResolved] = useState<{ classSlug: string; specSlug: string } | null>(null);
  const [contentType, setContentType] = useState<"mythic_plus" | "raid">("mythic_plus");
  const [selectedBoss, setSelectedBoss] = useState<string>("all-bosses");
  const [encounters, setEncounters] = useState<EncounterOption[]>([]);
  const [data, setData] = useState<ArchonPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Resolve params
  useEffect(() => {
    params.then((p) => setResolved({ classSlug: p.class, specSlug: p.spec }));
  }, [params]);

  const classInfo = resolved ? CLASS_INFO.find((c) => c.slug === resolved.classSlug) : null;
  const specInfo = classInfo?.specs.find((s) => s.slug === resolved?.specSlug);

  const loadGuide = useCallback(async () => {
    if (!resolved) return;
    setLoading(true);
    setError("");

    try {
      const ct = contentType === "raid" ? "raid" : "mythic_plus";
      const enc = contentType === "raid" && selectedBoss !== "all-bosses" ? `&encounter=${selectedBoss}` : "";
      const res = await fetch(
        `/api/compare/archon?classSlug=${resolved.classSlug}&specSlug=${resolved.specSlug}&contentType=${ct}${enc}`
      );
      const json = await res.json();

      if (json.success) {
        setData(json._rawData || null);
        // The archon route transforms data — we need raw data too.
        // Actually, let's fetch raw archon data for the guide.
      }

      // Fetch raw archon data directly for guide display
      const archonRes = await fetch(
        `/api/guide/archon?classSlug=${resolved.classSlug}&specSlug=${resolved.specSlug}&contentType=${ct}${enc}`
      );
      const archonJson = await archonRes.json();
      if (archonJson.success) {
        setData(archonJson.data);
      } else {
        setError(archonJson.error || "No se pudieron cargar los datos");
      }
    } catch (e) {
      setError("Error al cargar datos de archon.gg");
    } finally {
      setLoading(false);
    }
  }, [resolved, contentType, selectedBoss]);

  // Load encounters for raid mode
  useEffect(() => {
    if (!resolved || contentType !== "raid") return;
    fetch(
      `/api/compare/archon?classSlug=${resolved.classSlug}&specSlug=${resolved.specSlug}&contentType=raid&listEncounters=true`
    )
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.encounters) setEncounters(d.encounters);
      })
      .catch(() => {});
  }, [resolved, contentType]);

  useEffect(() => {
    loadGuide();
  }, [loadGuide]);

  if (!resolved) return null;
  if (classInfo && !specInfo) notFound();
  if (!classInfo) notFound();

  return (
    <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem", paddingTop: "2rem", paddingBottom: "2rem" }}>
      {/* Header */}
      <div style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "1.5rem",
        marginBottom: "1rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}>
        <img
          src={`https://render.worldofwarcraft.com/us/icons/56/${classInfo!.icon}.jpg`}
          alt={classInfo!.name}
          style={{ width: "4rem", height: "4rem", borderRadius: "0.5rem" }}
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {specInfo!.name} {classInfo!.name}
          </h1>
          {/* Spec selector */}
          <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
            {classInfo!.specs.map((s) => (
              <a
                key={s.slug}
                href={`/guides/${resolved.classSlug}/${s.slug}`}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  padding: "0.25rem 0.75rem",
                  borderRadius: "0.375rem",
                  textDecoration: "none",
                  background: s.slug === resolved.specSlug ? "var(--primary)" : "var(--card-hover)",
                  color: s.slug === resolved.specSlug ? "white" : "var(--muted)",
                  border: "1px solid " + (s.slug === resolved.specSlug ? "var(--primary)" : "var(--border)"),
                }}
              >
                {s.name}
              </a>
            ))}
          </div>
        </div>
        <a
          href={`/compare`}
          style={{
            background: "var(--primary)",
            color: "white",
            fontWeight: 600,
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontSize: "0.875rem",
            flexShrink: 0,
          }}
        >
          Comparar mi personaje
        </a>
      </div>

      {/* Content type toggle + Boss selector */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => { setContentType("mythic_plus"); setSelectedBoss("all-bosses"); }}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            background: contentType === "mythic_plus" ? "var(--primary)" : "var(--card)",
            color: contentType === "mythic_plus" ? "white" : "var(--muted)",
          }}
        >
          Mythic+
        </button>
        <button
          onClick={() => setContentType("raid")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            background: contentType === "raid" ? "var(--primary)" : "var(--card)",
            color: contentType === "raid" ? "white" : "var(--muted)",
          }}
        >
          Raid
        </button>

        {contentType === "raid" && encounters.length > 0 && (
          <select
            value={selectedBoss}
            onChange={(e) => setSelectedBoss(e.target.value)}
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
            }}
          >
            {encounters.map((enc) => (
              <option key={enc.value} value={enc.value}>{enc.label}</option>
            ))}
          </select>
        )}

        {loading && (
          <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>Cargando...</span>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: "rgba(248,81,73,0.05)",
          border: "1px solid rgba(248,81,73,0.3)",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          textAlign: "center",
        }}>
          <p style={{ color: "var(--danger)", fontWeight: 500 }}>{error}</p>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.5rem" }}>
            No se pudieron obtener datos de archon.gg para {specInfo!.name} {classInfo!.name}.
          </p>
        </div>
      )}

      {/* Guide content */}
      {data && !error && (
        <>
          {/* Metric Tiles from talent builds */}
          {data.talentBuilds && data.talentBuilds.length > 0 && data.talentBuilds[0].metricTiles && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}>
              {data.talentBuilds[0].metricTiles!.map((tile, i) => (
                <div key={i} style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>{tile.label}</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)" }}>{tile.value}</div>
                </div>
              ))}
              <div style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "0.75rem 1rem",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.25rem" }}>Total Parses</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{data.totalParses.toLocaleString()}</div>
              </div>
            </div>
          )}

          {/* Talent Builds Section */}
          <Section title="Talent Builds" subtitle="Builds mas populares entre top players">
            {(!data.talentBuilds || data.talentBuilds.length === 0) ? (
              <EmptyState text="No hay datos de talentos disponibles" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {data.talentBuilds.map((build, idx) => (
                  <TalentBuildCard key={idx} build={build} idx={idx} />
                ))}
              </div>
            )}
          </Section>

          {/* Stats Priority Section */}
          <Section title="Stats Priority" subtitle="Prioridad de stats basada en el promedio de top players">
            {data.stats.length === 0 ? (
              <EmptyState text="No hay datos de stats disponibles" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {data.stats.map((stat, idx) => {
                  const maxRating = Math.max(...data.stats.map((s) => s.rating));
                  const barPct = maxRating > 0 ? (stat.rating / maxRating) * 100 : 0;
                  return (
                    <div key={stat.name} style={{
                      background: "var(--card-hover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      padding: "0.75rem 1rem",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{
                            background: idx === 0 ? "var(--success)" : "var(--primary)",
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
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 500 }}>{STAT_LABELS[stat.name] || stat.name}</span>
                          {idx === 0 && (
                            <span style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              padding: "0.1rem 0.4rem",
                              borderRadius: "0.25rem",
                              background: "rgba(63, 185, 80, 0.15)",
                              color: "var(--success)",
                              textTransform: "uppercase" as const,
                            }}>
                              Top Priority
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                          {stat.rating.toLocaleString()} avg
                        </span>
                      </div>
                      <div style={{
                        height: "0.5rem",
                        background: "rgba(48, 54, 61, 0.5)",
                        borderRadius: "9999px",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${barPct}%`,
                          height: "100%",
                          borderRadius: "9999px",
                          background: idx === 0 ? "var(--success)" : idx === 1 ? "var(--primary)" : "var(--warning)",
                          transition: "width 0.5s ease-out",
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* BiS Gear Section */}
          <Section title="BiS Gear" subtitle="Equipamiento mas popular entre top players por slot">
            {SLOT_ORDER.filter((s) => data.gear.some((g) => g.slot === s) || data.weapons.some((w) => w.slot === s) || data.trinkets.some((t) => t.slot === s)).length === 0 ? (
              <EmptyState text="No hay datos de gear disponibles" />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {SLOT_ORDER.map((slot) => {
                  const slotItems = [
                    ...data.gear.filter((g) => g.slot === slot),
                    ...data.weapons.filter((w) => w.slot === slot),
                    ...data.trinkets.filter((t) => t.slot === slot),
                  ].sort((a, b) => b.popularity - a.popularity);

                  if (slotItems.length === 0) return null;

                  return (
                    <div key={slot} style={{
                      background: "var(--card-hover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.625rem 1rem",
                      display: "grid",
                      gridTemplateColumns: "7rem 1fr",
                      gap: "1rem",
                      alignItems: "center",
                    }}>
                      <div style={{
                        textTransform: "capitalize" as const,
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        color: "var(--muted)",
                      }}>
                        {slot.replace(/_/g, " ")}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {slotItems.slice(0, 3).map((item, i) => {
                          const popPct = Math.round(item.popularity);
                          return (
                            <div key={item.itemId} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                              <a
                                href={`https://www.wowhead.com/item=${item.itemId}`}
                                data-wh-rename="false"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "0.8125rem",
                                  fontWeight: i === 0 ? 600 : 400,
                                  color: i === 0 ? "var(--primary)" : "var(--muted)",
                                  textDecoration: "none",
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                {item.name}
                              </a>
                              <div style={{
                                width: "6rem",
                                height: "0.375rem",
                                background: "rgba(48, 54, 61, 0.5)",
                                borderRadius: "9999px",
                                overflow: "hidden",
                                flexShrink: 0,
                              }}>
                                <div style={{
                                  width: `${popPct}%`,
                                  height: "100%",
                                  borderRadius: "9999px",
                                  background: popPct >= 50 ? "var(--success)" : popPct >= 25 ? "var(--primary)" : "var(--warning)",
                                }} />
                              </div>
                              <span style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: popPct >= 50 ? "var(--success)" : "var(--muted)",
                                width: "3rem",
                                textAlign: "right" as const,
                                flexShrink: 0,
                              }}>
                                {popPct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Enchants & Gems Section */}
          <Section title="Encantos y Gemas" subtitle="Encantos y gemas mas usados por top players">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              {/* Enchants */}
              <div>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Encantos por Slot</h4>
                {(() => {
                  // Collect enchants from gear items
                  const enchantsBySlot: Record<string, { id: number; name: string; popularity: number }[]> = {};
                  for (const item of [...data.gear, ...data.weapons, ...data.trinkets]) {
                    if (item.enchants.length > 0) {
                      if (!enchantsBySlot[item.slot]) enchantsBySlot[item.slot] = [];
                      for (const e of item.enchants) {
                        enchantsBySlot[item.slot].push({ id: e.id, name: e.name, popularity: item.popularity });
                      }
                    }
                  }
                  // Deduplicate
                  for (const slot of Object.keys(enchantsBySlot)) {
                    const seen = new Map<number, number>();
                    enchantsBySlot[slot] = enchantsBySlot[slot].filter((e) => {
                      if ((seen.get(e.id) || 0) >= e.popularity) return false;
                      seen.set(e.id, e.popularity);
                      return true;
                    }).sort((a, b) => b.popularity - a.popularity).slice(0, 3);
                  }

                  const slots = Object.keys(enchantsBySlot);
                  if (slots.length === 0) return <EmptyState text="No hay datos de encantos" />;

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {slots.map((slot) => (
                        <div key={slot} style={{
                          background: "var(--card-hover)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          padding: "0.5rem 0.75rem",
                        }}>
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "capitalize", marginBottom: "0.25rem" }}>
                            {slot.replace(/_/g, " ")}
                          </div>
                          {enchantsBySlot[slot].map((ench) => (
                            <a
                              key={ench.id}
                              href={`https://www.wowhead.com/spell=${ench.id}`}
                              data-wh-rename="false"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: "0.8125rem",
                                color: "var(--success)",
                                textDecoration: "none",
                                display: "block",
                              }}
                            >
                              {ench.name} <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>({Math.round(ench.popularity)}%)</span>
                            </a>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Gems */}
              <div>
                <h4 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>Gemas Populares</h4>
                {(() => {
                  const gemMap = new Map<number, { name: string; popularity: number }>();
                  for (const item of [...data.gear, ...data.weapons, ...data.trinkets]) {
                    for (const g of item.gems) {
                      const existing = gemMap.get(g.id);
                      if (!existing || existing.popularity < item.popularity) {
                        gemMap.set(g.id, { name: g.name, popularity: item.popularity });
                      }
                    }
                  }
                  const gems = Array.from(gemMap.entries())
                    .map(([id, d]) => ({ id, ...d }))
                    .sort((a, b) => b.popularity - a.popularity)
                    .slice(0, 8);

                  if (gems.length === 0) return <EmptyState text="No hay datos de gemas" />;

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {gems.map((gem) => (
                        <div key={gem.id} style={{
                          background: "var(--card-hover)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          padding: "0.5rem 0.75rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}>
                          <a
                            href={`https://www.wowhead.com/item=${gem.id}`}
                            data-wh-rename="false"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            {gem.name}
                          </a>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)" }}>
                            {Math.round(gem.popularity)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </Section>
        </>
      )}

      {/* Loading skeleton */}
      {loading && !data && !error && (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--muted)" }}>Cargando datos de archon.gg para {specInfo?.name} {classInfo?.name}...</p>
        </div>
      )}
    </div>
  );
}

/* ========== Sub-components ========== */

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      padding: "1.5rem",
      marginBottom: "1rem",
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{title}</h3>
      <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "1rem" }}>{subtitle}</p>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "1.5rem" }}>
      <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{text}</p>
    </div>
  );
}

function TalentBuildCard({ build, idx }: { build: ArchonTalentBuild; idx: number }) {
  const popNum = typeof build.popularity === "string" ? parseFloat(build.popularity) : build.popularity;
  const popPct = Math.round(popNum);
  const wowheadUrl = build.exportCode
    ? `https://www.wowhead.com/talent-calculator#export/${build.exportCode}`
    : null;

  const handleCopy = () => {
    if (build.exportCode) {
      navigator.clipboard?.writeText(build.exportCode);
    }
  };

  return (
    <div style={{
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
              textTransform: "uppercase" as const,
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
            <a href={wowheadUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: "0.75rem", color: "var(--primary)", textDecoration: "none",
              padding: "0.25rem 0.5rem", border: "1px solid var(--primary)", borderRadius: "0.25rem",
            }}>
              Wowhead
            </a>
          )}
          {build.reportUrl && (
            <a href={build.reportUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: "0.75rem", color: "var(--muted)", textDecoration: "none",
              padding: "0.25rem 0.5rem", border: "1px solid var(--border)", borderRadius: "0.25rem",
            }}>
              WCL Log
            </a>
          )}
        </div>
      </div>

      {/* Popularity bar */}
      <div style={{
        height: "0.375rem", background: "rgba(48, 54, 61, 0.5)",
        borderRadius: "9999px", overflow: "hidden", marginBottom: "0.75rem",
      }}>
        <div style={{
          width: `${popPct}%`, height: "100%", borderRadius: "9999px",
          background: popPct >= 50 ? "var(--success)" : popPct >= 20 ? "var(--primary)" : "var(--warning)",
        }} />
      </div>

      {/* Export code */}
      {build.exportCode && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "0.25rem",
        }}>
          <code style={{
            flex: 1, color: "var(--muted)", fontSize: "0.75rem",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          }}>
            {build.exportCode}
          </code>
          <button
            onClick={handleCopy}
            style={{
              fontSize: "0.7rem", padding: "0.2rem 0.5rem",
              border: "1px solid var(--border)", borderRadius: "0.25rem",
              background: "var(--card)", color: "var(--muted)", cursor: "pointer", flexShrink: 0,
            }}
          >
            Copiar
          </button>
        </div>
      )}
    </div>
  );
}
