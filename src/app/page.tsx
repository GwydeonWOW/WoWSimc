import { CLASS_INFO } from "@/types/wow";

export default function HomePage() {
  return (
    <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1rem", paddingTop: "2rem", paddingBottom: "2rem" }}>
      {/* Hero */}
      <section style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1 style={{ fontSize: "2.25rem", fontWeight: 700, marginBottom: "1rem" }}>
          <span style={{ color: "var(--primary)" }}>WoW</span>Simc
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1.125rem", maxWidth: "42rem", margin: "0 auto", marginBottom: "1.5rem" }}>
          Analiza tu personaje de World of Warcraft. Pega el string del addon SimulationCraft
          y comparalo con los mejores jugadores del mundo.
        </p>
        <a
          href="/compare"
          style={{
            display: "inline-block",
            background: "var(--primary)",
            color: "white",
            fontWeight: 600,
            padding: "0.75rem 2rem",
            borderRadius: "0.5rem",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          Comparar mi personaje
        </a>
      </section>

      {/* Class Grid - All specs */}
      <section style={{ marginBottom: "3rem" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>
          Guias por Clase y Spec
        </h2>
        {CLASS_INFO.map((cls) => (
          <div key={cls.slug} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <img
                src={`https://render.worldofwarcraft.com/us/icons/56/${cls.icon}.jpg`}
                alt={cls.name}
                style={{ width: "1.75rem", height: "1.75rem", borderRadius: "0.25rem" }}
                loading="lazy"
              />
              <span style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{cls.name}</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {cls.specs.map((spec) => (
                <a
                  key={spec.slug}
                  href={`/guides/${cls.slug}/${spec.slug}`}
                  style={{
                    display: "block",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    padding: "0.375rem 0.75rem",
                    textDecoration: "none",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "var(--foreground)",
                    transition: "background 0.2s, border-color 0.2s",
                  }}
                  className="class-card"
                >
                  {spec.name}
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "2rem",
      }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", textAlign: "center" }}>Como funciona</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "2rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.5rem" }}>1</div>
            <h3 style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Instala el addon SimC</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Descarga el addon SimulationCraft desde CurseForge o GitHub.
              Escribe <code style={{ color: "var(--accent)" }}>/simc</code> en el juego.
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.5rem" }}>2</div>
            <h3 style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Pega tu string</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Copia el texto generado y pegalo en la pagina de comparacion.
              Se parsearan tus stats, gear y talentos automaticamente.
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--primary)", marginBottom: "0.5rem" }}>3</div>
            <h3 style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Analiza y mejora</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Comparacion detallada contra los top 50 jugadores de tu spec.
              Recomendaciones de gear, stats y talentos.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
