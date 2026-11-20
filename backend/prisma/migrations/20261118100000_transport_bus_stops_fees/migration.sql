-- Transport v2: bus stops (shared across routes), bus fee entries, student bus mapping details.
-- ADDITIVE ONLY: no existing table/column/row is altered or dropped.

CREATE TABLE IF NOT EXISTS "bus_stops" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "stop_name" VARCHAR(150) NOT NULL,
  "slab_name" VARCHAR(100),
  "geocode" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bus_stops_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bus_stops_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bus_stops_school_id_id_key" ON "bus_stops"("school_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "bus_stops_school_id_stop_name_key" ON "bus_stops"("school_id", "stop_name");

CREATE TABLE IF NOT EXISTS "bus_stop_routes" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "bus_stop_id" UUID NOT NULL,
  "route_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bus_stop_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bus_stop_routes_bus_stop_id_fkey" FOREIGN KEY ("bus_stop_id") REFERENCES "bus_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bus_stop_routes_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bus_stop_routes_bus_stop_id_route_id_key" ON "bus_stop_routes"("bus_stop_id", "route_id");
CREATE INDEX IF NOT EXISTS "bus_stop_routes_school_id_route_id_idx" ON "bus_stop_routes"("school_id", "route_id");

CREATE TABLE IF NOT EXISTS "bus_fees" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "kind" VARCHAR(10) NOT NULL DEFAULT 'STOP',
  "bus_stop_id" UUID,
  "slab_name" VARCHAR(100),
  "due_date" VARCHAR(10) NOT NULL,
  "one_way_amount" DECIMAL(12,2) NOT NULL,
  "two_way_amount" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bus_fees_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bus_fees_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bus_fees_bus_stop_id_fkey" FOREIGN KEY ("bus_stop_id") REFERENCES "bus_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "bus_fees_school_id_id_key" ON "bus_fees"("school_id", "id");
CREATE INDEX IF NOT EXISTS "bus_fees_school_id_bus_stop_id_idx" ON "bus_fees"("school_id", "bus_stop_id");
CREATE INDEX IF NOT EXISTS "bus_fees_school_id_slab_name_idx" ON "bus_fees"("school_id", "slab_name");

-- Student mapping details (all nullable, existing rows stay untouched)
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "bus_stop_id" UUID;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "travel_mode" VARCHAR(30);
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "transport_effect_from" VARCHAR(10);
DO $$ BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_bus_stop_id_fkey" FOREIGN KEY ("bus_stop_id") REFERENCES "bus_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
