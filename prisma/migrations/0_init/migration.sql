-- CreateTable
CREATE TABLE "TopPlayerAggregate" (
    "id" TEXT NOT NULL,
    "classSlug" TEXT NOT NULL,
    "specSlug" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "topTalentBuild" TEXT NOT NULL,
    "talentPickRates" JSONB NOT NULL,
    "avgStats" JSONB NOT NULL,
    "statPriority" JSONB NOT NULL,
    "gearPopularity" JSONB NOT NULL,
    "enchantPopularity" JSONB NOT NULL,
    "gemPopularity" JSONB NOT NULL,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopPlayerAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachedCharacter" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classSlug" TEXT NOT NULL,
    "specSlug" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 80,
    "race" TEXT NOT NULL,
    "equipment" JSONB NOT NULL,
    "talents" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "mythicPlusScore" DOUBLE PRECISION,
    "raidProgression" JSONB,
    "source" TEXT NOT NULL DEFAULT 'blizzard_api',
    "lastFetched" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "classSlug" TEXT,
    "specSlug" TEXT,
    "contentType" TEXT,
    "playerCount" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopPlayerAggregate_classSlug_specSlug_contentType_season_key" ON "TopPlayerAggregate"("classSlug", "specSlug", "contentType", "season");

-- CreateIndex
CREATE UNIQUE INDEX "CachedCharacter_region_realm_name_key" ON "CachedCharacter"("region", "realm", "name");
