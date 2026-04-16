import { CLASS_INFO } from "@/types/wow";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ class: string; spec: string }>;
}

export default async function GuidePage({ params }: PageProps) {
  const { class: classSlug, spec: specSlug } = await params;

  const classInfo = CLASS_INFO.find((c) => c.slug === classSlug);
  if (!classInfo) notFound();

  const specInfo = classInfo.specs.find((s) => s.slug === specSlug);
  if (!specInfo) notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <img
            src={`https://render.worldofwarcraft.com/us/icons/56/${classInfo.icon}.jpg`}
            alt={classInfo.name}
            className="w-16 h-16 rounded"
          />
          <div>
            <h1 className="text-2xl font-bold">
              {specInfo.name} {classInfo.name}
            </h1>
            <p className="text-muted text-sm mt-1">
              Guia basada en datos de los top 50 jugadores - Pronto disponible
            </p>
          </div>
          <a
            href={`/compare?class=${classSlug}&spec=${specSlug}`}
            className="ml-auto bg-primary hover:bg-primary-hover text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Comparar mi personaje
          </a>
        </div>
      </div>

      {/* Placeholder sections */}
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: "Talent Builds", desc: "Builds mas populares entre top players con heatmap de pick rates" },
          { title: "Stats Priority", desc: "Prioridad de stats y distribucion de valores de top players" },
          { title: "BiS Gear", desc: "Mejor equipo por slot con popularidad entre top players" },
          { title: "Enchants & Gems", desc: "Encantos y gemas recomendados por slot" },
        ].map((section) => (
          <div key={section.title} className="bg-card border border-border rounded-lg p-6">
            <h2 className="font-semibold mb-2">{section.title}</h2>
            <p className="text-sm text-muted">{section.desc}</p>
            <div className="mt-4 text-xs text-muted/50 italic">
              Disponible en Fase 3 del desarrollo
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
