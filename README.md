# WoWSimc - WoW Character Analyzer

Analiza tu personaje de World of Warcraft y comparalo con los mejores jugadores del mundo. Importa tus datos via el addon SimulationCraft, compara stats, gear y talentos contra los top 50 jugadores de tu spec.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **PostgreSQL** + **Prisma** ORM
- **Redis** para cache
- **Blizzard API** + **Raider.IO API**
- **Docker** para deploy en Coolify

## Deploy en Coolify

### Opcion 1: Docker Compose (recomendado)

1. En Coolify, crea un nuevo recurso y selecciona **"Docker Compose"**
2. Conecta tu repositorio Git
3. Coolify detectara el `docker-compose.yml` automaticamente
4. Configura las variables de entorno en el panel de Coolify:

| Variable | Descripcion | Requerida |
|----------|-------------|-----------|
| `BLIZZARD_CLIENT_ID` | Client ID de Blizzard API | Si |
| `BLIZZARD_CLIENT_SECRET` | Client Secret de Blizzard API | Si |
| `RAIDERIO_API_KEY` | API key de Raider.IO | No |
| `DATABASE_URL` | URL PostgreSQL (auto si usas compose) | Auto |
| `REDIS_URL` | URL Redis (auto si usas compose) | Auto |

5. Despliega. Coolify construira la imagen y levantara los 3 servicios (app, postgres, redis).

### Opcion 2: Solo la app (con PostgreSQL y Redis externos)

1. En Coolify, crea un nuevo recurso **"Application"**
2. Selecciona **"Build from Dockerfile"**
3. Configura las variables de entorno:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/wowsimc
   REDIS_URL=redis://host:6379
   BLIZZARD_CLIENT_ID=tu_client_id
   BLIZZARD_CLIENT_SECRET=tu_client_secret
   ```
4. Despliega

### Post-deploy: Migraciones y seed

Despues del primer deploy, ejecuta dentro del contenedor de la app:

```bash
# Migrar la base de datos
npx prisma migrate deploy

# Poblar con datos iniciales
npx tsx prisma/seed.ts
```

En Coolify puedes hacerlo desde **Terminal** del contenedor, o configurar un **Command** en el compose:

```yaml
app:
  # ... resto de config
  command: >
    sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts && node server.js"
```

## Desarrollo Local

```bash
# 1. Clona el repo
git clone <repo-url>
cd WoWSimc

# 2. Copia las variables de entorno
cp .env.local.example .env.local
# Edita .env.local con tus credenciales de Blizzard

# 3. Levanta PostgreSQL y Redis
docker compose up -d postgres redis

# 4. Instala dependencias
npm install

# 5. Genera el cliente Prisma y ejecuta migraciones
npx prisma generate
npx prisma migrate dev --name init

# 6. Seed con datos mock
npx tsx prisma/seed.ts

# 7. Arranca el servidor de desarrollo
npm run dev
```

Abre http://localhost:3000

## Estructura del Proyecto

```
src/
  app/
    page.tsx                    # Home
    compare/page.tsx            # Comparador de personajes
    guides/[class]/[spec]/      # Guias por clase/spec
    api/
      simc/parse/               # Parser del string SimC
      blizzard/                 # Proxy Blizzard API
  lib/
    simc/parser.ts              # Parser del addon SimulationCraft
    api/blizzard.ts             # Cliente Blizzard API
    api/raiderio.ts             # Cliente Raider.IO
    comparison/engine.ts        # Motor de comparacion y scoring
    db/index.ts                 # Prisma client
  types/
    wow.ts                      # Tipos de WoW (clases, specs, gear)
    comparison.ts               # Tipos de comparacion
prisma/
  schema.prisma                 # Esquema de base de datos
  seed.ts                       # Datos iniciales
```

## Obtener credenciales de Blizzard API

1. Ve a https://develop.battle.net/
2. Crea una cuenta o inicia sesion
3. Crea un nuevo cliente OAuth en **My Account > API Access**
4. Selecciona **World of Warcraft** y tu region
5. Copia el Client ID y Client Secret a `.env.local`

## Como usar

1. Instala el addon [SimulationCraft](https://www.curseforge.com/wow/addons/simulationcraft) en WoW
2. En el juego, escribe `/simc` para generar el string de tu personaje
3. Copia el texto y pegalo en https://tu-dominio/compare
4. Analiza tus stats, gear y talentos vs los top players
