-- One send (possibly to many classes/sections) = one batch, shown as a single card
ALTER TABLE "academic_resources" ADD COLUMN IF NOT EXISTS "batch_id" UUID;
ALTER TABLE "academic_resources" ADD COLUMN IF NOT EXISTS "all_classes" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "academic_resources_school_id_batch_id_idx"
  ON "academic_resources"("school_id", "batch_id");
