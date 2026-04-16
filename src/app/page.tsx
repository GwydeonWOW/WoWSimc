import { CLASS_INFO } from "@/types/wow";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero */}
      <section className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          <span className="text-primary">WoW</span>Simc
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto mb-6">
          Analiza tu personaje de World of Warcraft. Pega el string del addon SimulationCraft
          y comparalo con los mejores jugadores del mundo.
        </p>
        <a
          href="/compare"
          className="inline-block bg-primary hover:bg-primary-hover text-white font-semibold px-8 py-3 rounded-lg transition-colors"
        >
          Comparar mi personaje
        </a>
      </section>

      {/* Class Grid */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-6">Guias por Clase</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {CLASS_INFO.map((cls) => (
            <a
              key={cls.slug}
              href={`/guides/${cls.slug}/${cls.specs[0].slug}`}
              className="bg-card hover:bg-card-hover border border-border rounded-lg p-4 transition-colors group"
            >
              <img
                src={`https://render.worldofwarcraft.com/us/icons/56/${cls.icon}.jpg`}
                alt={cls.name}
                className="w-12 h-12 rounded mx-auto mb-2"
                loading="lazy"
              />
              <div className="text-center text-sm font-medium group-hover:text-primary transition-colors">
                {cls.name}
              </div>
              <div className="text-center text-xs text-muted mt-1">
                {cls.specs.length} specs
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card border border-border rounded-lg p-8">
        <h2 className="text-xl font-semibold mb-6 text-center">Como funciona</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">1</div>
            <h3 className="font-medium mb-2">Instala el addon SimC</h3>
            <p className="text-sm text-muted">
              Descarga el addon SimulationCraft desde CurseForge o GitHub.
              Escribe <code className="text-accent">/simc</code> en el juego.
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">2</div>
            <h3 className="font-medium mb-2">Pega tu string</h3>
            <p className="text-sm text-muted">
              Copia el texto generado y pegalo en la pagina de comparacion.
              Se parsearan tus stats, gear y talentos automaticamente.
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">3</div>
            <h3 className="font-medium mb-2">Analiza y mejora</h3>
            <p className="text-sm text-muted">
              Comparacion detallada contra los top 50 jugadores de tu spec.
              Recomendaciones de gear, stats y talentos.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
