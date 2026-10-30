-- PostGIS is created by infra/postgres/init as superuser (no-op there); pg_trgm is a trusted
-- extension the database owner may create. Both keep the migration self-contained for tests.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "occurrence_status" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA', 'REJEITADA', 'DUPLICADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CIDADAO', 'GESTOR', 'ADMIN');

-- CreateTable
CREATE TABLE "occurrences" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "citizen_id" UUID NOT NULL,
    "citizen_name" VARCHAR(120) NOT NULL,
    "citizen_email" VARCHAR(254) NOT NULL,
    "category_id" UUID NOT NULL,
    "category_name" VARCHAR(80) NOT NULL,
    "category_slug" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "status" "occurrence_status" NOT NULL DEFAULT 'RECEBIDA',
    "location" geography(Point, 4326) NOT NULL,
    "lat" DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y("location"::geometry)) STORED NOT NULL,
    "lng" DOUBLE PRECISION GENERATED ALWAYS AS (ST_X("location"::geometry)) STORED NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "photo_key" VARCHAR(200),
    "original_id" UUID,
    "rejection_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "from_status" "occurrence_status",
    "to_status" "occurrence_status" NOT NULL,
    "note" VARCHAR(1000),
    "reason" VARCHAR(1000),
    "changed_by" UUID NOT NULL,
    "changed_by_role" "user_role" NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "boundary_cache" (
    "name" VARCHAR(120) NOT NULL,
    "boundary" geometry(MultiPolygon, 4326) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boundary_cache_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "occurrences_reference_key" ON "occurrences"("reference");

-- CreateIndex
CREATE INDEX "occurrences_location_idx" ON "occurrences" USING GIST ("location");

-- CreateIndex
CREATE INDEX "occurrences_citizen_id_created_at_idx" ON "occurrences"("citizen_id", "created_at");

-- CreateIndex
CREATE INDEX "occurrences_status_idx" ON "occurrences"("status");

-- CreateIndex
CREATE INDEX "occurrences_category_slug_idx" ON "occurrences"("category_slug");

-- CreateIndex
CREATE INDEX "occurrences_created_at_idx" ON "occurrences"("created_at");

-- CreateIndex
CREATE INDEX "status_history_occurrence_id_changed_at_idx" ON "status_history"("occurrence_id", "changed_at");

-- CreateIndex
CREATE INDEX "boundary_cache_boundary_idx" ON "boundary_cache" USING GIST ("boundary");

-- AddForeignKey
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_original_id_fkey" FOREIGN KEY ("original_id") REFERENCES "occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Business rules enforced by the database as a last line of defence.
ALTER TABLE "occurrences"
  ADD CONSTRAINT "occurrences_description_length" CHECK (char_length("description") BETWEEN 10 AND 500),
  ADD CONSTRAINT "occurrences_reference_format" CHECK ("reference" ~ '^SIN-[0-9]{4}-[0-9]{5,}$'),
  ADD CONSTRAINT "occurrences_not_own_original" CHECK ("original_id" IS NULL OR "original_id" <> "id"),
  ADD CONSTRAINT "occurrences_duplicate_has_original" CHECK ("status" <> 'DUPLICADA' OR "original_id" IS NOT NULL),
  ADD CONSTRAINT "occurrences_rejected_has_reason" CHECK ("status" <> 'REJEITADA' OR "rejection_reason" IS NOT NULL);

-- Staff search (q) matches reference, address and description with ILIKE '%...%'.
CREATE INDEX "occurrences_reference_trgm_idx" ON "occurrences" USING GIN ("reference" gin_trgm_ops);
CREATE INDEX "occurrences_address_trgm_idx" ON "occurrences" USING GIN ("address" gin_trgm_ops);
CREATE INDEX "occurrences_description_trgm_idx" ON "occurrences" USING GIN ("description" gin_trgm_ops);

-- One row per occurrence with the derived facts the dashboard aggregates (RF17, BDA).
-- Cancelled occurrences are excluded from every indicator.
CREATE VIEW "occurrence_facts" AS
SELECT
  o."id",
  o."reference",
  o."status",
  o."category_id",
  o."category_slug",
  o."category_name",
  o."created_at",
  o."resolved_at",
  o."status" IN ('RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO') AS "is_open",
  date_trunc('month', o."created_at" AT TIME ZONE 'Europe/Lisbon')::date AS "created_month",
  CASE WHEN o."resolved_at" IS NOT NULL
       THEN EXTRACT(EPOCH FROM (o."resolved_at" - o."created_at")) / 86400.0 END AS "resolution_days",
  -- ~500 m grid cell (0.005 degrees) used for the hotspot map.
  round((floor(o."lat" / 0.005) * 0.005 + 0.0025)::numeric, 5)::double precision AS "cell_lat",
  round((floor(o."lng" / 0.005) * 0.005 + 0.0025)::numeric, 5)::double precision AS "cell_lng"
FROM "occurrences" o
WHERE o."status" <> 'ANULADA';
