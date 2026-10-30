-- PostGIS is created by infra/postgres/init as superuser; this is a no-op there and keeps the
-- migration self-contained for fresh test databases.
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "municipality" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "boundary" geometry(MultiPolygon, 4326) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "municipality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "municipality_name_key" ON "municipality"("name");

-- CreateIndex
CREATE INDEX "municipality_boundary_idx" ON "municipality" USING GIST ("boundary");


-- Category names are unique ignoring case ("Vias" and "vias" are the same category).
CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (lower("name"));
